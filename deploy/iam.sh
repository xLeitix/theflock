#!/usr/bin/env bash
# Operator-only IAM setup for this project's three separate CI identities.
set -euo pipefail
project=theflock-icet
region=europe-north2
number=5455359145
vm="flock-vm@$project.iam.gserviceaccount.com"
for item in publish verify vm; do
  role=roles/artifactregistry.reader
  if test "$item" = publish; then role=roles/artifactregistry.writer; fi
  gcloud artifacts repositories add-iam-policy-binding flock --location="$region" --member="serviceAccount:flock-$item@$project.iam.gserviceaccount.com" --role="$role" --project="$project" --quiet >/dev/null
done
gcloud kms keys add-iam-policy-binding release --keyring=flock --location="$region" --member="serviceAccount:flock-verify@$project.iam.gserviceaccount.com" --role=roles/cloudkms.signerVerifier --project="$project" --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$project-releases" --member="serviceAccount:flock-verify@$project.iam.gserviceaccount.com" --role=roles/storage.objectCreator --quiet >/dev/null
for item in vm verify; do
  gcloud storage buckets add-iam-policy-binding "gs://$project-releases" --member="serviceAccount:flock-$item@$project.iam.gserviceaccount.com" --role=roles/storage.objectViewer --quiet >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$project-backups" --member="serviceAccount:$vm" --role=roles/storage.objectCreator --quiet >/dev/null
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:flock-deploy@$project.iam.gserviceaccount.com" --role=roles/compute.viewer --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:flock-deploy@$project.iam.gserviceaccount.com" --role=roles/compute.osLogin --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:flock-deploy@$project.iam.gserviceaccount.com" --role=roles/iap.tunnelResourceAccessor --condition='expression=destination.port == 22 && destination.ip == "10.64.0.2",title=flock_ssh_only' --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$vm" --member="serviceAccount:flock-deploy@$project.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser --project="$project" --quiet >/dev/null
if ! gcloud iam workload-identity-pools describe github --location=global --project="$project" --quiet >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github --location=global --display-name='Flock GitHub releases' --project="$project" --quiet
fi
if ! gcloud iam workload-identity-pools providers describe flock --workload-identity-pool=github --location=global --project="$project" --quiet >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc flock --workload-identity-pool=github --location=global --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.environment=assertion.environment' --attribute-condition="assertion.repository_id == '1440286900' && assertion.repository_owner_id == '38304' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'push' && assertion.workflow_ref == 'xLeitix/theflock/.github/workflows/release.yml@refs/heads/main' && assertion.environment in ['preview-publish', 'preview-verify', 'preview-deploy']" --project="$project" --quiet
fi
for item in publish verify deploy; do
  gcloud iam service-accounts add-iam-policy-binding "flock-$item@$project.iam.gserviceaccount.com" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/github/attribute.environment/preview-$item" --project="$project" --quiet >/dev/null
done
gcloud kms keys versions get-public-key 1 --key=release --keyring=flock --location="$region" --project="$project" --output-file=.local/cloud/release-public.pem --quiet
echo 'Flock IAM and federation configured.'

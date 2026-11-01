#!/usr/bin/env bash
# Operator-only initial resources. All changes are scoped to the separate project.
set -euo pipefail
project=theflock-icet
region=europe-north2
zone=europe-north2-a
gcloud projects describe "$project" --quiet >/dev/null
for account in flock-vm flock-publish flock-verify flock-deploy; do
  if ! gcloud iam service-accounts describe "$account@$project.iam.gserviceaccount.com" --project="$project" --quiet >/dev/null 2>&1; then
    gcloud iam service-accounts create "$account" --display-name="$account" --project="$project" --quiet
  fi
done
if ! gcloud compute networks describe flock --project="$project" --quiet >/dev/null 2>&1; then
  gcloud compute networks create flock --subnet-mode=custom --bgp-routing-mode=regional --project="$project" --quiet
  gcloud compute networks subnets create flock --network=flock --range=10.64.0.0/28 --region="$region" --project="$project" --quiet
  gcloud compute firewall-rules create flock-web --network=flock --allow=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=flock-preview --project="$project" --quiet
  gcloud compute firewall-rules create flock-iap-ssh --network=flock --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=flock-preview --project="$project" --quiet
fi
if ! gcloud compute addresses describe flock-preview --region="$region" --project="$project" --quiet >/dev/null 2>&1; then
  gcloud compute addresses create flock-preview --region="$region" --network-tier=STANDARD --project="$project" --quiet
fi
if ! gcloud artifacts repositories describe flock --location="$region" --project="$project" --quiet >/dev/null 2>&1; then
  gcloud artifacts repositories create flock --location="$region" --repository-format=docker --immutable-tags --project="$project" --quiet
fi
for bucket in releases backups; do
  if ! gcloud storage buckets describe "gs://$project-$bucket" --project="$project" --quiet >/dev/null 2>&1; then
    gcloud storage buckets create "gs://$project-$bucket" --location="$region" --uniform-bucket-level-access --public-access-prevention --project="$project" --quiet
  fi
done
if ! gcloud kms keyrings describe flock --location="$region" --project="$project" --quiet >/dev/null 2>&1; then
  gcloud kms keyrings create flock --location="$region" --project="$project" --quiet
fi
if ! gcloud kms keys describe release --keyring=flock --location="$region" --project="$project" --quiet >/dev/null 2>&1; then
  gcloud kms keys create release --keyring=flock --location="$region" --purpose=asymmetric-signing --default-algorithm=rsa-sign-pkcs1-2048-sha256 --project="$project" --quiet
fi
if ! gcloud compute disks describe flock-data --zone="$zone" --project="$project" --quiet >/dev/null 2>&1; then
  gcloud compute disks create flock-data --zone="$zone" --size=10GB --type=pd-balanced --labels=application=theflock --project="$project" --quiet
fi
gcloud compute addresses describe flock-preview --region="$region" --project="$project" --format='value(address)'

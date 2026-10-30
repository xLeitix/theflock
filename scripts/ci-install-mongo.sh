#!/usr/bin/env bash
set -euo pipefail

# This exact official build is for the workflow's Ubuntu 22.04 x86_64 runner.
# Its SHA-256 was verified against fastdl.mongodb.org on 2026-10-30. Updating
# MongoDB requires updating and reviewing the version and checksum together.
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'CI MongoDB installer requires Linux x86_64 (Ubuntu 22.04).' >&2
  exit 1
fi
: "${RUNNER_TEMP:?Run this installer on a GitHub Actions runner}"
: "${GITHUB_ENV:?GitHub environment file is required}"

mongo_version='7.0.31'
mongo_archive="mongodb-linux-x86_64-ubuntu2204-${mongo_version}.tgz"
mongo_sha256='3da9daf35a0a49c506e0e5d6f6a8045787c9cf9f27ad441123e82b6d17efff7b'
mongo_directory="$(mktemp -d "$RUNNER_TEMP/flock-mongodb.XXXXXX")"

curl --fail --location --silent --show-error --retry 3 \
  "https://fastdl.mongodb.org/linux/$mongo_archive" \
  --output "$mongo_directory/$mongo_archive"
printf '%s  %s\n' "$mongo_sha256" "$mongo_directory/$mongo_archive" | sha256sum --check --strict -
tar -xzf "$mongo_directory/$mongo_archive" -C "$mongo_directory" --strip-components=1
"$mongo_directory/bin/mongod" --version
printf 'FLOCK_MONGOD=%s/bin/mongod\n' "$mongo_directory" >> "$GITHUB_ENV"

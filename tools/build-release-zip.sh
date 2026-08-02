#!/usr/bin/env bash

set -euo pipefail
umask 077

fail() {
  printf 'Release ZIP build failed: %s\n' "$1" >&2
  exit 1
}

script_dir="$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
project_dir="$(CDPATH= cd -P -- "$script_dir/.." 2>/dev/null && pwd)"

[ -n "$project_dir" ] || fail "the repository root could not be resolved"
command -v git >/dev/null 2>&1 || fail "Git is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required to verify the archive"
if command -v sha256sum >/dev/null 2>&1; then
  checksum_command=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  checksum_command=shasum
else
  fail "sha256sum or shasum is required"
fi

source_commit="$(git -C "$project_dir" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" ||
  fail "the repository does not have a readable HEAD commit"
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] ||
  fail "HEAD did not resolve to a 40-character commit ID"

if [ "$#" -gt 1 ]; then
  fail "usage: tools/build-release-zip.sh [output.zip]"
fi

requested_output="${1:-$project_dir/code-quest.zip}"
case "$requested_output" in
  /*)
    output_file="$requested_output"
    ;;
  *)
    output_file="$PWD/$requested_output"
    ;;
esac

output_dir="$(CDPATH= cd -P -- "$(dirname -- "$output_file")" 2>/dev/null && pwd)" ||
  fail "the output directory does not exist: $(dirname -- "$output_file")"
output_file="$output_dir/$(basename -- "$output_file")"
artifact_name="$(basename -- "$output_file")"
checksum_file="$output_file.sha256"
manifest_file="$output_file.manifest.json"

release_manifest="$(printf '{\n  "schemaVersion": 1,\n  "product": "code-quest",\n  "sourceCommit": "%s"\n}' "$source_commit")"

is_forbidden_release_path() {
  local path="$1"

  case "$path" in
    .env.example | */.env.example)
      return 1
      ;;
    .env | .env.* | */.env | */.env.* | \
      .git | .git/* | */.git | */.git/* | \
      node_modules | node_modules/* | */node_modules | */node_modules/* | \
      dist | dist/* | */dist | */dist/* | \
      build | build/* | */build | */build/* | \
      target | target/* | */target | */target/* | \
      coverage | coverage/* | */coverage | */coverage/* | \
      *.class | *.log | \
      code-quest.zip | */code-quest.zip | \
      code-quest.zip.manifest.json | */code-quest.zip.manifest.json | \
      code-quest.zip.sha256 | */code-quest.zip.sha256)
      return 0
      ;;
  esac

  return 1
}

while IFS= read -r tracked_path; do
  [ "$tracked_path" != RELEASE_MANIFEST.json ] ||
    fail "HEAD contains the generated release manifest path: $tracked_path"
  if is_forbidden_release_path "$tracked_path"; then
    fail "HEAD contains a secret or build artifact: $tracked_path"
  fi
done < <(git -C "$project_dir" -c core.quotePath=false ls-tree -r --name-only "$source_commit")

temporary_zip=""
temporary_checksum=""
temporary_manifest=""
temporary_expected_paths=""
temporary_archive_paths=""

cleanup() {
  local temporary_file

  for temporary_file in \
    "$temporary_zip" \
    "$temporary_checksum" \
    "$temporary_manifest" \
    "$temporary_expected_paths" \
    "$temporary_archive_paths"; do
    if [ -n "$temporary_file" ]; then
      rm -f -- "$temporary_file"
    fi
  done
}
trap cleanup EXIT

temporary_zip="$(mktemp "$output_dir/.code-quest-release.XXXXXX")" ||
  fail "a temporary archive could not be created"
temporary_checksum="$(mktemp "$output_dir/.code-quest-checksum.XXXXXX")" ||
  fail "a temporary checksum file could not be created"
temporary_manifest="$(mktemp "$output_dir/.code-quest-manifest.XXXXXX")" ||
  fail "a temporary manifest file could not be created"
temporary_expected_paths="$(mktemp "$output_dir/.code-quest-expected.XXXXXX")" ||
  fail "a temporary expected-path list could not be created"
temporary_archive_paths="$(mktemp "$output_dir/.code-quest-archive.XXXXXX")" ||
  fail "a temporary archive-path list could not be created"

(umask 022 && LC_ALL=C TZ=UTC git -C "$project_dir" archive \
    --format=zip \
    --prefix=code-quest/ \
    --add-virtual-file="code-quest/RELEASE_MANIFEST.json:$release_manifest" \
    --output="$temporary_zip" \
    "$source_commit") ||
  fail "git archive failed"

unzip -tqq "$temporary_zip" ||
  fail "the generated ZIP did not pass its integrity check"

required_start_script=0
required_compose_file=0
required_env_template=0
required_release_manifest=0

while IFS= read -r archive_path; do
  case "$archive_path" in
    code-quest/)
      continue
      ;;
    code-quest/*)
      relative_path="${archive_path#code-quest/}"
      relative_path="${relative_path%/}"
      ;;
    *)
      fail "an archive entry is outside the code-quest/ directory: $archive_path"
      ;;
  esac

  [ -n "$relative_path" ] || continue
  case "$archive_path" in
    */)
      ;;
    *)
      printf '%s\n' "$relative_path" >>"$temporary_archive_paths"
      ;;
  esac

  if is_forbidden_release_path "$relative_path"; then
    fail "the archive contains a secret or build artifact: $archive_path"
  fi

  case "$relative_path" in
    start.sh)
      required_start_script=1
      ;;
    docker-compose.yml)
      required_compose_file=1
      ;;
    .env.example)
      required_env_template=1
      ;;
    RELEASE_MANIFEST.json)
      required_release_manifest=1
      ;;
  esac
done < <(unzip -Z1 "$temporary_zip")

[ "$required_start_script" -eq 1 ] || fail "start.sh is missing from the archive"
[ "$required_compose_file" -eq 1 ] || fail "docker-compose.yml is missing from the archive"
[ "$required_env_template" -eq 1 ] || fail ".env.example is missing from the archive"
[ "$required_release_manifest" -eq 1 ] || fail "RELEASE_MANIFEST.json is missing from the archive"

git -C "$project_dir" -c core.quotePath=false \
  ls-tree -r --name-only "$source_commit" >"$temporary_expected_paths" ||
  fail "the expected archive paths could not be read"
printf '%s\n' RELEASE_MANIFEST.json >>"$temporary_expected_paths"
LC_ALL=C sort -o "$temporary_expected_paths" "$temporary_expected_paths"
LC_ALL=C sort -o "$temporary_archive_paths" "$temporary_archive_paths"
cmp -s "$temporary_expected_paths" "$temporary_archive_paths" ||
  fail "the archive file list does not match the source commit plus RELEASE_MANIFEST.json"

archived_manifest="$(unzip -p "$temporary_zip" code-quest/RELEASE_MANIFEST.json)" ||
  fail "RELEASE_MANIFEST.json could not be read from the archive"
[ "$archived_manifest" = "$release_manifest" ] ||
  fail "RELEASE_MANIFEST.json does not identify the archived source commit"

if [ "$checksum_command" = sha256sum ]; then
  archive_hash="$(sha256sum "$temporary_zip" | awk '{ print $1 }')" ||
    fail "the release ZIP SHA-256 could not be calculated"
else
  archive_hash="$(LC_ALL=C shasum -a 256 "$temporary_zip" | awk '{ print $1 }')" ||
    fail "the release ZIP SHA-256 could not be calculated"
fi
[[ "$archive_hash" =~ ^[0-9a-f]{64}$ ]] ||
  fail "the release ZIP SHA-256 has an unexpected format"

printf '%s  %s\n' "$archive_hash" "$artifact_name" >"$temporary_checksum" ||
  fail "the checksum file could not be written"
printf '%s\n' "$release_manifest" >"$temporary_manifest" ||
  fail "the external release manifest could not be written"
chmod 644 "$temporary_zip" "$temporary_checksum" "$temporary_manifest" ||
  fail "the release file permissions could not be set to 644"
mv -f -- "$temporary_zip" "$output_file" ||
  fail "the verified archive could not be moved to $output_file"
mv -f -- "$temporary_checksum" "$checksum_file" ||
  fail "the checksum file could not be moved to $checksum_file"
mv -f -- "$temporary_manifest" "$manifest_file" ||
  fail "the external release manifest could not be moved to $manifest_file"

printf 'Release ZIP: %s\n' "$output_file"
printf 'Release manifest: %s\n' "$manifest_file"
printf 'SHA-256 file: %s\n' "$checksum_file"
printf 'Source HEAD: %s\n' "$source_commit"
printf 'SHA-256: %s\n' "$archive_hash"

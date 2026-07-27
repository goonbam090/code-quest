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

git -C "$project_dir" rev-parse --verify HEAD >/dev/null 2>&1 ||
  fail "the repository does not have a readable HEAD commit"

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
      *.class | *.log | code-quest.zip | */code-quest.zip)
      return 0
      ;;
  esac

  return 1
}

while IFS= read -r tracked_path; do
  if is_forbidden_release_path "$tracked_path"; then
    fail "HEAD contains a secret or build artifact: $tracked_path"
  fi
done < <(git -C "$project_dir" -c core.quotePath=false ls-tree -r --name-only HEAD)

temporary_zip="$(mktemp "$output_dir/.code-quest-release.XXXXXX")" ||
  fail "a temporary archive could not be created"

cleanup() {
  rm -f -- "$temporary_zip"
}
trap cleanup EXIT

git -C "$project_dir" archive \
  --format=zip \
  --prefix=code-quest/ \
  --output="$temporary_zip" \
  HEAD ||
  fail "git archive failed"

unzip -tqq "$temporary_zip" ||
  fail "the generated ZIP did not pass its integrity check"

required_start_script=0
required_compose_file=0
required_env_template=0

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
  esac
done < <(unzip -Z1 "$temporary_zip")

[ "$required_start_script" -eq 1 ] || fail "start.sh is missing from the archive"
[ "$required_compose_file" -eq 1 ] || fail "docker-compose.yml is missing from the archive"
[ "$required_env_template" -eq 1 ] || fail ".env.example is missing from the archive"

mv -f -- "$temporary_zip" "$output_file" ||
  fail "the verified archive could not be moved to $output_file"
trap - EXIT
chmod 644 "$output_file" ||
  fail "the archive permissions could not be set to 644"

if command -v sha256sum >/dev/null 2>&1; then
  archive_hash="$(sha256sum "$output_file" | awk '{ print $1 }')"
else
  archive_hash="$(LC_ALL=C shasum -a 256 "$output_file" | awk '{ print $1 }')"
fi

printf 'Release ZIP: %s\n' "$output_file"
printf 'Source HEAD: %s\n' "$(git -C "$project_dir" rev-parse HEAD)"
printf 'SHA-256: %s\n' "$archive_hash"

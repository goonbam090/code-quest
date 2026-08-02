# Code Quest 릴리스 가이드

이 문서는 유지관리자가 검증된 `main` 산출물을 버전이 있는 GitHub Release로 게시하는 절차를
정의합니다. 사용자 업데이트 절차는 [`UPDATE.md`](UPDATE.md)를 따릅니다.

## 버전 정책

- 릴리스 버전의 기준은 Git tag 하나이며 형식은 `vMAJOR.MINOR.PATCH`입니다.
- `v1.2`, `v01.2.3`, prerelease와 build metadata가 포함된 tag는 자동화가 거부합니다.
- 최초 버전과 이후 MAJOR·MINOR·PATCH 선택은 변경의 호환성을 검토한 뒤 유지관리자가 결정합니다.
  workflow가 버전을 추측하거나 tag를 대신 만들지 않습니다.
- 이미 정식 Release가 있으면 새 버전은 가장 높은 기존 stable version보다 커야 합니다.
- 릴리스 대상은 반드시 `main` 이력에 포함되고 해당 commit의 `main` push CI가 성공해야 합니다.

## 자동화가 보장하는 것

`main` CI는 통합 테스트가 끝난 뒤 Git `HEAD`의 추적 파일로 게시용 파일을 만들고, 같은
workflow의 별도 최소 권한 job에서 세 파일을 함께 식별하는 build provenance attestation을
생성합니다.

```text
code-quest.zip
code-quest.zip.manifest.json
code-quest.zip.sha256
```

`vMAJOR.MINOR.PATCH` tag가 push되면 Release workflow는 다음 순서로 동작합니다.

1. tag 형식, 기존 stable version보다 큰지와 tag commit의 `main` 포함 여부를 확인합니다.
2. 같은 commit에서 성공한 정확한 `main` push CI workflow run을 찾습니다.
3. 그 CI가 올린 세 파일을 다시 빌드하지 않고 내려받습니다.
4. ZIP 무결성, SHA-256, 내·외부 manifest와 source commit을 확인합니다.
5. 세 파일의 signer workflow, source commit, source ref와 hosted runner provenance를 검증합니다.
6. 모든 검증이 끝난 뒤에만 세 파일을 첨부한 GitHub Release를 게시합니다.

이 자동화는 새 폴더 최초 실행을 검증하지만 실제 구버전 ZIP과 기존 PostgreSQL volume을 사용한
업그레이드 호환성을 증명하지 않습니다. 그 검증은 별도 PR과 CI 시나리오에서 다룹니다.

## 릴리스 전 준비

1. 릴리스할 변경이 `main`에 merge되었는지 확인합니다.
2. 해당 `main` commit의 `CI` workflow 전체가 성공했고 `Attest release files` job이 성공했는지
   확인합니다.
3. 변경의 호환성을 검토하고 실제 릴리스 버전을 결정합니다.
4. 첫 정식 릴리스 전에 GitHub의 Immutable Releases를 활성화하고, `v*` tag의 변경·삭제를 막는
   tag ruleset을 설정하는 것을 권장합니다. 이 저장소 파일만으로 해당 외부 설정은 바뀌지
   않습니다.

CI artifact 보존 기간은 90일입니다. 대상 commit의 artifact가 만료되었으면 Release workflow는
실패하며, 다른 commit의 파일이나 로컬에서 다시 만든 ZIP으로 대체하지 않습니다.

## tag 생성과 게시

아래 `vX.Y.Z`는 검토 후 결정한 실제 버전으로 바꿉니다. tag push는 GitHub Release 게시를
시작하므로, 대상 commit과 버전을 다시 확인한 뒤 실행합니다.

```bash
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "Code Quest vX.Y.Z"
git push origin vX.Y.Z
```

GitHub Actions의 `Release` workflow가 성공하면 해당 tag의 Release에서 첨부된 세 파일을
확인합니다. GitHub가 자동으로 보여 주는 `Source code (zip)`과 `Source code (tar.gz)`는
`code-quest.zip` 배포본이 아닙니다.

## 게시 후 확인

별도 빈 폴더에서 첨부 파일을 내려받아 확인합니다.

```bash
gh release download vX.Y.Z \
  --pattern 'code-quest.zip' \
  --pattern 'code-quest.zip.manifest.json' \
  --pattern 'code-quest.zip.sha256' \
  --repo bam090/code-quest
shasum -a 256 --check code-quest.zip.sha256
for release_file in \
  code-quest.zip \
  code-quest.zip.manifest.json \
  code-quest.zip.sha256; do
  gh attestation verify "$release_file" \
    --repo bam090/code-quest \
    --signer-workflow github.com/bam090/code-quest/.github/workflows/ci.yml \
    --source-ref refs/heads/main \
    --deny-self-hosted-runners
done
```

SHA-256은 세 파일 중 ZIP이 전송 중 바뀌지 않았는지 확인하고, attestation은 산출물이 이
저장소의 GitHub Actions workflow에서 생성되었는지 검증합니다. 어느 검증도 특정 구버전의
데이터·진도 호환성을 대신 증명하지는 않습니다.

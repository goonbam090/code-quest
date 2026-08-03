# Branch, Commit, and Pull Request Rules

## Git Branch Rules

모든 작업은 최신 `origin/main`에서 만든 새로운 브랜치에서 시작한다.

브랜치 이름은 다음 규칙을 따른다.

```text
<branch-type>/<short-description>
```

`short-description`은 영문 소문자, 숫자와 하이픈만 사용하는 kebab-case여야 한다.
전체 브랜치명은 다음 정규식을 만족해야 한다.

```regex
^(feature|refactor|fix|docs|chore|test)/[a-z0-9]+(?:-[a-z0-9]+)*$
```

작업 유형별 이름은 다음 표를 기준으로 한다.

| 작업 유형 | Branch type | Commit type | PR Type |
| --- | --- | --- | --- |
| 기능 | `feature` | `feat` | `Feature` |
| 리팩터링 | `refactor` | `refactor` | `Refactor` |
| 버그 수정 | `fix` | `fix` | `Fix` |
| 문서 | `docs` | `docs` | `Docs` |
| 유지보수 | `chore` | `chore` | `Chore` |
| 테스트 | `test` | `test` | `Test` |

예시:

```text
feature/html-selector-search
refactor/problem-engine
fix/question-reset
docs/ai-rules
test/selector-engine
```

## Commit Rules

커밋 메시지는 다음 규칙을 따른다.

```text
<commit-type>: <description>
```

`commit-type`은 위 표의 값을 사용한다. 하나의 커밋에는 하나의 변경 의도만 포함한다.

예시:

```text
feat: add html selector search
fix: correct hint reset bug
refactor: simplify question renderer
docs: add AI_RULES
test: add selector engine tests
chore: configure eslint
```

## Pull Request Title Rules

PR 제목은 다음 규칙을 따른다.

```text
[Type] <Title>
```

예시:

```text
[Feature] HTML Selector Search
[Fix] Hint Button Reset
[Refactor] Question Engine
[Docs] Add AI Rules
[Chore] Configure GitHub Actions
[Test] Selector Engine
```

PR 제목의 `Type`은 브랜치의 작업 유형과 일치해야 한다. `]` 뒤에는 공백 한 칸이 필요하며,
`<Title>`은 공백이 아닌 문자로 시작하고 끝나야 한다.

PR은 Draft로 생성하며 본문에 다음 항목을 포함한다.

- 문제 정의
- 검증 결과
- 예상 리스크

## Merge Rules

solo 운영에서는 approving review를 필수로 요구하지 않는다. 다음 GitHub Actions 검사는
정확한 이름으로 모두 성공해야 한다.

- `CI gate`
- `Branch and PR title`

Ready for Review 전환은 merge 승인이 아니다. merge는 두 필수 검사가 모두 성공하고 사용자가
명시적으로 요청한 경우에만 수행한다.

동일 저장소의 `dependabot[bot]`이 만든 `dependabot/*` 브랜치는 자동 업데이트를 위해
예외를 적용한다. 이 경우 PR 제목은 `Bump `, `[Chore] ` 또는 Dependabot이 생성하는
`chore(deps): bump `로 시작해야 한다.

const branchPattern = /^(feature|refactor|fix|docs|chore|test)\/[a-z0-9]+(?:-[a-z0-9]+)*$/
const titlePattern = /^\[(Feature|Refactor|Fix|Docs|Chore|Test)\] \S(?:.*\S)?$/
const titleTypeByBranchType = new Map([
  ['feature', 'Feature'],
  ['refactor', 'Refactor'],
  ['fix', 'Fix'],
  ['docs', 'Docs'],
  ['chore', 'Chore'],
  ['test', 'Test']
])

export function validatePullRequestMetadata({
  author,
  branch,
  title,
  headRepository,
  repository
}) {
  const failures = []
  const sameRepository = headRepository === repository

  if (
    sameRepository
    && author === 'dependabot[bot]'
    && branch.startsWith('dependabot/')
  ) {
    if (!/^(?:Bump \S|\[Chore\] \S)/.test(title)) {
      failures.push('Dependabot PR titles must start with "Bump " or "[Chore] ".')
    }
    return failures
  }

  if (!branchPattern.test(branch)) {
    failures.push(
      'Branch name must match <type>/<short-description> using an allowed type and lowercase kebab-case description.'
    )
  }

  const titleMatch = titlePattern.exec(title)
  if (!titleMatch) {
    failures.push(
      'PR title must match [Type] <Title> using Feature, Refactor, Fix, Docs, Chore, or Test.'
    )
    return failures
  }

  if (branchPattern.test(branch)) {
    const branchType = branch.slice(0, branch.indexOf('/'))
    const expectedTitleType = titleTypeByBranchType.get(branchType)
    if (titleMatch[1] !== expectedTitleType) {
      failures.push(
        `PR title type [${titleMatch[1]}] does not match branch type ${branchType}; expected [${expectedTitleType}].`
      )
    }
  }

  return failures
}

export function validateEnvironment(environment) {
  const requiredNames = [
    'PR_AUTHOR',
    'PR_HEAD_REF',
    'PR_TITLE',
    'PR_HEAD_REPOSITORY',
    'GITHUB_REPOSITORY'
  ]
  const missingNames = requiredNames.filter(name => !environment[name])

  if (missingNames.length > 0) {
    return [`Missing required environment variables: ${missingNames.join(', ')}`]
  }

  return validatePullRequestMetadata({
    author: environment.PR_AUTHOR,
    branch: environment.PR_HEAD_REF,
    title: environment.PR_TITLE,
    headRepository: environment.PR_HEAD_REPOSITORY,
    repository: environment.GITHUB_REPOSITORY
  })
}

if (process.argv[1]?.endsWith('validate-pr-metadata.mjs')) {
  const failures = validateEnvironment(process.env)

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`::error title=Invalid pull request metadata::${failure}`)
    }
    process.exitCode = 1
  } else {
    console.log('Pull request branch and title follow the repository rules.')
  }
}

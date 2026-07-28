export function findUnsuccessfulJobs(jobs) {
  return Object.entries(jobs)
    .filter(([, job]) => job?.result !== 'success')
    .map(([name, job]) => `${name}: ${job?.result ?? 'missing'}`)
}

export function verifyRequiredJobResults(serializedJobs) {
  let jobs
  try {
    jobs = JSON.parse(serializedJobs)
  } catch {
    return ['Required job results are not valid JSON.']
  }

  if (
    jobs === null
    || Array.isArray(jobs)
    || typeof jobs !== 'object'
    || Object.keys(jobs).length === 0
  ) {
    return ['No required job results were provided.']
  }

  return findUnsuccessfulJobs(jobs)
}

if (process.argv[1]?.endsWith('verify-ci-results.mjs')) {
  const failures = verifyRequiredJobResults(process.env.REQUIRED_JOB_RESULTS ?? '')

  if (failures.length > 0) {
    console.error(`Required jobs did not succeed:\n${failures.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('All required jobs succeeded.')
  }
}

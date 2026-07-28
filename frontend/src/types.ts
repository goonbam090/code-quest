export type ProblemLearning = {
  keywords: string[]
  summary: string
  example: {
    code: string
    explanation: string
  }
  principles: string[]
  applications: Array<{
    title: string
    description: string
    code?: string
  }>
  pitfalls: string[]
}

export type Problem = {
  id: number
  category: string
  number: number
  displayNumber?: number
  mode: 'selector' | 'declaration' | 'stylesheet' | 'html' | 'java' | 'javascript' | 'algorithm'
  stage: string
  title: string
  question: string
  html: string
  starterCode: string
  examples: Array<{
    input: string
    output: string
    trace: Array<{ label: string; state: string; detail: string }>
  }>
  constraints: string[]
  hints: string[]
  learning?: ProblemLearning
}

export type TestCaseResult = {
  visibility: 'PUBLIC' | 'HIDDEN'
  number: number
  label: string
  input: string
  expected: string
  actual: string
  error: string
  passed: boolean
}

export type TestReport = {
  passed: number
  total: number
  publicPassed: number
  publicTotal: number
  hiddenPassed: number
  hiddenTotal: number
  cases: TestCaseResult[]
}

export type Submission = {
  correct: boolean
  firstSolve: boolean
  status: 'CORRECT' | 'EMPTY' | 'TYPO' | 'SYNTAX' | 'INCORRECT' | 'ERROR'
  diagnosticCode:
    | 'NONE'
    | 'EMPTY_ANSWER'
    | 'SELECTOR_TYPO'
    | 'SELECTOR_SYNTAX'
    | 'SELECTOR_MISMATCH'
    | 'HTML_SYNTAX'
    | 'HTML_STRUCTURE_MISMATCH'
    | 'HTML_UNSAFE_CONTENT'
    | 'PROPERTY_NAME_TYPO'
    | 'UNKNOWN_PROPERTY'
    | 'INVALID_PROPERTY_VALUE'
    | 'MISSING_UNIT'
    | 'FORBIDDEN_RESOURCE'
    | 'INPUT_TOO_LARGE'
    | 'RENDER_LIMIT'
    | 'UNBALANCED_DELIMITER'
    | 'MALFORMED_DECLARATION'
    | 'MISSING_REQUIRED_PROPERTY'
    | 'VALUE_MISMATCH'
    | 'RESULT_MISMATCH'
    | 'COMPILE_ERROR'
    | 'FORBIDDEN_API'
    | 'SOURCE_CONTRACT'
    | 'TEST_FAILURE'
    | 'RUNTIME_ERROR'
    | 'TIME_LIMIT'
    | 'JUDGE_UNAVAILABLE'
  message: string
  intentExplanation: string
  guidance: string
  errorLine?: number
  testReport?: TestReport
  solution?: {
    summary: string
    keyPoints: string[]
    alternative: string
    complexity: string
    referenceAnswer?: string | null
    selectorBreakdown?: Array<{
      fragment: string
      explanation: string
    }>
  }
}

export type Progress = {
  learnerKey: string
  solved: number
  attempts: number
  solvedProblemIds: number[]
}

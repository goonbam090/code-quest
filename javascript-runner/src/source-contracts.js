import { parse } from 'acorn'

const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/
const DANGEROUS_GLOBALS = new Set([
  'Deno',
  'process',
  'require',
  'fetch',
  'WebSocket',
  'EventSource',
  'XMLHttpRequest',
  'Worker',
  'SharedWorker',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'eval',
  'Function',
  'WebAssembly'
])

const CONTRACT_GUIDANCE = new Map([
  ['none', ''],
  ['function-declaration-helper',
    'solve의 반환값을 만드는 과정에서 이름을 가진 function 선언식 helper를 호출해 보세요.'],
  ['arrow-function-helper',
    'solve의 반환값을 만드는 과정에서 화살표 함수 helper를 호출해 보세요.'],
  ['rest-parameter',
    'solve의 마지막 매개변수를 `...values` 같은 rest 매개변수로 선언해 보세요.'],
  ['closure-counter',
    '상태를 감싼 함수가 안쪽 함수를 반환하고, solve가 그 클로저를 실제 계산에 사용하도록 작성해 보세요.'],
  ['class-instance',
    'constructor를 가진 class의 인스턴스를 `new`로 만들고 그 인스턴스를 결과 계산에 사용해 보세요.'],
  ['promise-chain',
    '`Promise.resolve(...)`에서 시작한 `.then(...)` 체인을 solve의 반환값으로 연결해 보세요.'],
  ['async-promise-all',
    'async solve의 반환값을 만드는 과정에서 비동기 map 작업을 `await Promise.all(...)`로 모아 보세요.']
])

const isNode = value => value !== null
  && typeof value === 'object'
  && typeof value.type === 'string'

const isFunctionNode = node => node
  && (node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression')

function visit(node, callback, ancestors = []) {
  if (!isNode(node)) return
  callback(node, ancestors)
  const nextAncestors = [...ancestors, node]
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        visit(value[index], callback, nextAncestors)
      }
    } else {
      visit(value, callback, nextAncestors)
    }
  }
}

function nearestFunction(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    if (isFunctionNode(ancestors[index])) return ancestors[index]
  }
  return null
}

function isPatternNode(pattern, candidate) {
  if (!pattern || !candidate) return false
  if (pattern === candidate) return true
  if (pattern.type === 'RestElement') return isPatternNode(pattern.argument, candidate)
  if (pattern.type === 'AssignmentPattern') return isPatternNode(pattern.left, candidate)
  if (pattern.type === 'ArrayPattern') {
    return pattern.elements.some(element => isPatternNode(element, candidate))
  }
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.some(property => isPatternNode(
      property.type === 'RestElement' ? property.argument : property.value,
      candidate
    ))
  }
  return false
}

function isReferenceIdentifier(node, parent) {
  if (!parent) return true
  if ((parent.type === 'FunctionDeclaration'
      || parent.type === 'FunctionExpression'
      || parent.type === 'ArrowFunctionExpression')
      && (parent.id === node || parent.params.some(parameter => isPatternNode(parameter, node)))) {
    return false
  }
  if ((parent.type === 'VariableDeclarator' && isPatternNode(parent.id, node))
      || ((parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression')
        && parent.id === node)
      || (parent.type === 'MemberExpression' && parent.property === node && !parent.computed)
      || (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand)
      || (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed)
      || parent.type === 'LabeledStatement'
      || parent.type === 'BreakStatement'
      || parent.type === 'ContinueStatement') {
    return false
  }
  return true
}

function definitionName(node) {
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration')
      && node.id?.type === 'Identifier') {
    return node.id.name
  }
  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    return node.id.name
  }
  if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') {
    return node.left.name
  }
  return null
}

function definitionValue(node) {
  if (node.type === 'VariableDeclarator') return node.init
  if (node.type === 'AssignmentExpression') return node.right
  return node
}

function definitionKind(node) {
  const value = definitionValue(node)
  if (node.type === 'FunctionDeclaration') return 'function-declaration'
  if (node.type === 'ClassDeclaration' || value?.type === 'ClassExpression') return 'class'
  if (value?.type === 'ArrowFunctionExpression') return 'arrow-function'
  if (value?.type === 'FunctionExpression') return 'function-expression'
  return 'value'
}

function collectDefinitions(ast) {
  const definitions = new Map()
  visit(ast, node => {
    const name = definitionName(node)
    if (!name) return
    const value = definitionValue(node)
    if (!value) return
    const entries = definitions.get(name) ?? []
    entries.push({ name, node, value, kind: definitionKind(node) })
    definitions.set(name, entries)
  })
  return definitions
}

function findSolve(definitions) {
  return (definitions.get('solve') ?? [])
    .map(definition => definition.value)
    .find(isFunctionNode) ?? null
}

function collectDirectReturns(functionNode) {
  const returns = []
  visit(functionNode.body, (node, ancestors) => {
    if (node.type === 'ReturnStatement'
        && node.argument
        && nearestFunction(ancestors) === functionNode) {
      returns.push(node.argument)
    }
  }, [functionNode])
  return returns
}

function collectReferences(root) {
  const references = new Set()
  visit(root, (node, ancestors) => {
    if (node.type !== 'Identifier') return
    const parent = ancestors.at(-1)
    if (isReferenceIdentifier(node, parent)) references.add(node.name)
  })
  return references
}

function memberObjectName(member) {
  return member?.type === 'MemberExpression' && member.object?.type === 'Identifier'
    ? member.object.name
    : null
}

function mutationRoots(functionNode, name) {
  const roots = []
  visit(functionNode.body, (node, ancestors) => {
    if (nearestFunction(ancestors) !== functionNode) return
    if (node.type === 'CallExpression'
        && memberObjectName(node.callee) === name) {
      roots.push(node)
    } else if (node.type === 'AssignmentExpression') {
      if (node.left?.type === 'Identifier' && node.left.name === name) roots.push(node)
      if (memberObjectName(node.left) === name) roots.push(node)
    } else if (node.type === 'UpdateExpression') {
      if (node.argument?.type === 'Identifier' && node.argument.name === name) roots.push(node)
      if (memberObjectName(node.argument) === name) roots.push(node)
    }
  }, [functionNode])
  return roots
}

function resultDependency(ast, solve, definitions) {
  const roots = collectDirectReturns(solve)
  const queuedRoots = [...roots]
  const seenRoots = new Set()
  const relevantNodes = new Set()
  const relevantNames = new Set()

  while (queuedRoots.length > 0) {
    const root = queuedRoots.shift()
    if (!isNode(root) || seenRoots.has(root)) continue
    seenRoots.add(root)
    visit(root, node => relevantNodes.add(node))

    for (const name of collectReferences(root)) {
      if (relevantNames.has(name)) continue
      relevantNames.add(name)
      for (const definition of definitions.get(name) ?? []) {
        queuedRoots.push(definition.value)
        relevantNodes.add(definition.node)
      }
      for (const mutation of mutationRoots(solve, name)) queuedRoots.push(mutation)
    }
  }

  return { relevantNodes, relevantNames }
}

function memberPropertyName(member) {
  if (member?.type !== 'MemberExpression') return null
  if (!member.computed && member.property?.type === 'Identifier') return member.property.name
  if (member.computed && member.property?.type === 'Literal'
      && typeof member.property.value === 'string') {
    return member.property.value
  }
  return null
}

function isNamedCall(node, objectName, propertyName) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && node.callee.object?.type === 'Identifier'
    && node.callee.object.name === objectName
    && memberPropertyName(node.callee) === propertyName
}

function callToName(node, name) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && node.callee.name === name
}

function relevantSome(dependency, predicate) {
  for (const node of dependency.relevantNodes) {
    if (predicate(node)) return true
  }
  return false
}

function returnsFunction(functionNode) {
  return collectDirectReturns(functionNode)
    .some(argument => argument.type === 'FunctionExpression'
      || argument.type === 'ArrowFunctionExpression')
}

function promiseResolveFeedsThen(node) {
  if (isNamedCall(node, 'Promise', 'resolve')) return true
  if (node?.type !== 'CallExpression'
      || node.callee?.type !== 'MemberExpression'
      || memberPropertyName(node.callee) !== 'then') {
    return false
  }
  return promiseResolveFeedsThen(node.callee.object)
}

function isPromiseAllCall(node) {
  return isNamedCall(node, 'Promise', 'all')
}

function hasAsyncMapCallback(node) {
  if (node?.type !== 'CallExpression'
      || node.callee?.type !== 'MemberExpression'
      || memberPropertyName(node.callee) !== 'map') {
    return false
  }
  return node.arguments.some(argument => isFunctionNode(argument) && argument.async)
}

function helperContractMatches(definitions, dependency, kind) {
  for (const [name, entries] of definitions) {
    if (name === 'solve') continue
    for (const definition of entries) {
      if (definition.kind !== kind || !dependency.relevantNodes.has(definition.node)) continue
      if (relevantSome(dependency, node => callToName(node, name))) return true
    }
  }
  return false
}

function closureContractMatches(definitions, dependency) {
  for (const [factoryName, entries] of definitions) {
    if (factoryName === 'solve') continue
    for (const definition of entries) {
      if (!isFunctionNode(definition.value)
          || !returnsFunction(definition.value)
          || !relevantSome(dependency, node => callToName(node, factoryName))) {
        continue
      }

      if (relevantSome(dependency, node => node.type === 'CallExpression'
          && node.callee?.type === 'CallExpression'
          && callToName(node.callee, factoryName))) {
        return true
      }

      for (const [closureName, closureEntries] of definitions) {
        const createdByFactory = closureEntries.some(entry =>
          entry.value?.type === 'CallExpression'
          && callToName(entry.value, factoryName)
          && dependency.relevantNodes.has(entry.node))
        if (createdByFactory
            && relevantSome(dependency, node => callToName(node, closureName))) {
          return true
        }
      }
    }
  }
  return false
}

function classContractMatches(definitions, dependency) {
  for (const [name, entries] of definitions) {
    if (!entries.some(entry => entry.kind === 'class'
        && dependency.relevantNodes.has(entry.node))) {
      continue
    }
    if (relevantSome(dependency, node => node.type === 'NewExpression'
        && node.callee?.type === 'Identifier'
        && node.callee.name === name)) {
      return true
    }
  }
  return false
}

export function parseSubmission(source) {
  return parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
    allowHashBang: false
  })
}

export function isForbiddenAst(ast, source = '') {
  if (source.includes('\0') || BIDI_CONTROL.test(source)) return true
  let forbidden = false
  visit(ast, (node, ancestors) => {
    if (forbidden) return
    if (node.type === 'ImportExpression') {
      forbidden = true
      return
    }
    if (node.type === 'Identifier') {
      const parent = ancestors.at(-1)
      if (isReferenceIdentifier(node, parent) && DANGEROUS_GLOBALS.has(node.name)) {
        forbidden = true
      }
      return
    }
    if (node.type === 'MemberExpression') {
      const property = memberPropertyName(node)
      if (DANGEROUS_GLOBALS.has(property)
          && (node.object?.type === 'Identifier'
            && (node.object.name === 'globalThis'
              || node.object.name === 'window'
              || node.object.name === 'self'))) {
        forbidden = true
      }
    }
  })
  return forbidden
}

export function isForbiddenSource(source) {
  try {
    return isForbiddenAst(parseSubmission(source), source)
  } catch {
    return source.includes('\0') || BIDI_CONTROL.test(source)
  }
}

export function evaluateSourceContractAst(ast, contractName = 'none') {
  const name = contractName || 'none'
  if (!CONTRACT_GUIDANCE.has(name)) {
    throw new TypeError('지원하지 않는 JavaScript 소스 코드 계약입니다.')
  }
  if (name === 'none') return null

  const definitions = collectDefinitions(ast)
  const solve = findSolve(definitions)
  if (!solve) return CONTRACT_GUIDANCE.get(name)
  const dependency = resultDependency(ast, solve, definitions)

  let matched = false
  if (name === 'function-declaration-helper') {
    matched = helperContractMatches(definitions, dependency, 'function-declaration')
  } else if (name === 'arrow-function-helper') {
    matched = helperContractMatches(definitions, dependency, 'arrow-function')
  } else if (name === 'rest-parameter') {
    matched = solve.params.length > 0 && solve.params.at(-1).type === 'RestElement'
  } else if (name === 'closure-counter') {
    matched = closureContractMatches(definitions, dependency)
  } else if (name === 'class-instance') {
    matched = classContractMatches(definitions, dependency)
  } else if (name === 'promise-chain') {
    matched = relevantSome(dependency, promiseResolveFeedsThen)
  } else if (name === 'async-promise-all') {
    const awaitedAll = relevantSome(dependency, node =>
      node.type === 'AwaitExpression' && isPromiseAllCall(node.argument))
    const asyncMap = relevantSome(dependency, hasAsyncMapCallback)
    matched = solve.async && awaitedAll && asyncMap
  }
  return matched ? null : CONTRACT_GUIDANCE.get(name)
}

export function evaluateSourceContract(source, contractName = 'none') {
  try {
    return evaluateSourceContractAst(parseSubmission(source), contractName)
  } catch (error) {
    if (error instanceof SyntaxError) return CONTRACT_GUIDANCE.get(contractName) ?? ''
    throw error
  }
}

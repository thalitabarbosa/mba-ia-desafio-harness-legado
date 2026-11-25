// Regras que não são de import, verificadas pela AST do TypeScript.
//   G5  process.env só em api/src/config/; import.meta.env só em web/src/config/
//   R1  nenhum comentário de supressão (eslint-disable, @ts-ignore, @ts-expect-error, @ts-nocheck)
//   R2  nenhum endereço fixo (localhost, 127.0.0.1, 0.0.0.0, /tmp/) fora das pastas config/
//
// Uso: node scripts/gates/regras.mjs [--json]
// Saída: uma linha por violação, "<ID> <arquivo>:<linha> <mensagem>".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXTENSOES = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const PASTAS = ['api/src', 'web/src']

function listar(dir) {
  const abs = path.join(RAIZ, dir)
  if (!fs.existsSync(abs)) return []
  const saida = []
  for (const entrada of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entrada.name === 'node_modules') continue
    const rel = path.posix.join(dir, entrada.name)
    if (entrada.isDirectory()) saida.push(...listar(rel))
    else if (EXTENSOES.test(entrada.name)) saida.push(rel)
  }
  return saida
}

const violacoes = []
function registrar(id, arquivo, fonte, no, mensagem) {
  const linha = fonte.getLineAndCharacterOfPosition(no.getStart ? no.getStart(fonte) : no.pos).line + 1
  violacoes.push({ id, arquivo, linha, mensagem })
}

// Tira parênteses, "!", "as", "satisfies" e "<T>x" da frente de uma expressão.
function desembrulhar(expr) {
  let e = expr
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))
  ) {
    e = e.expression
  }
  return e
}

function nomeDaPropriedade(no) {
  if (ts.isPropertyAccessExpression(no)) return no.name.text
  if (ts.isElementAccessExpression(no)) {
    const arg = desembrulhar(no.argumentExpression)
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text
  }
  return undefined
}

const MODULOS_PROCESS = new Set(['process', 'node:process'])

function ehRequireDeProcess(e) {
  return (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === 'require' &&
    e.arguments.length === 1 &&
    ts.isStringLiteral(e.arguments[0]) &&
    MODULOS_PROCESS.has(e.arguments[0].text)
  )
}

// --- G5 na API: process.env -------------------------------------------------
function verificarProcessEnv(arquivo, fonte) {
  const apelidos = new Set(['process'])
  const ehProcesso = (expr) => {
    const e = desembrulhar(expr)
    if (!e) return false
    if (ts.isIdentifier(e)) return apelidos.has(e.text)
    if (ehRequireDeProcess(e)) return true
    if (ts.isAwaitExpression(e)) return ehProcesso(e.expression)
    if (ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = e.arguments[0]
      return !!a && ts.isStringLiteral(a) && MODULOS_PROCESS.has(a.text)
    }
    const nome = nomeDaPropriedade(e)
    if (nome === 'process') {
      const base = desembrulhar(e.expression)
      return ts.isIdentifier(base) && ['globalThis', 'global', 'window', 'self'].includes(base.text)
    }
    if (nome === 'default') return ehProcesso(e.expression)
    return false
  }

  // 1a passada: apelidos (import process from 'process', const p = process, ...)
  const coletar = (no) => {
    if (ts.isImportDeclaration(no) && ts.isStringLiteral(no.moduleSpecifier) && MODULOS_PROCESS.has(no.moduleSpecifier.text)) {
      const c = no.importClause
      if (c?.name) apelidos.add(c.name.text)
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) apelidos.add(c.namedBindings.name.text)
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) {
        for (const el of c.namedBindings.elements) {
          const original = (el.propertyName ?? el.name).text
          if (original === 'env') registrar('G5', arquivo, fonte, el, "import de 'env' do módulo process fora de api/src/config/")
          if (original === 'default') apelidos.add(el.name.text)
        }
      }
    }
    if (ts.isImportEqualsDeclaration(no) && ts.isExternalModuleReference(no.moduleReference)) {
      const m = no.moduleReference.expression
      if (ts.isStringLiteral(m) && MODULOS_PROCESS.has(m.text)) apelidos.add(no.name.text)
    }
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer && ehProcesso(no.initializer)) {
      apelidos.add(no.name.text)
    }
    ts.forEachChild(no, coletar)
  }
  // repete até estabilizar (apelido de apelido)
  let antes = -1
  while (antes !== apelidos.size) {
    antes = apelidos.size
    coletar(fonte)
  }

  const visitar = (no) => {
    if ((ts.isPropertyAccessExpression(no) || ts.isElementAccessExpression(no)) && nomeDaPropriedade(no) === 'env' && ehProcesso(no.expression)) {
      registrar('G5', arquivo, fonte, no, 'process.env fora de api/src/config/')
    }
    if (ts.isVariableDeclaration(no) && ts.isObjectBindingPattern(no.name) && no.initializer && ehProcesso(no.initializer)) {
      for (const el of no.name.elements) {
        const chave = el.propertyName ? (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName) ? el.propertyName.text : '') : ts.isIdentifier(el.name) ? el.name.text : ''
        if (chave === 'env') registrar('G5', arquivo, fonte, el, 'desestruturação de process.env fora de api/src/config/')
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
}

// --- G5 no front: import.meta.env -------------------------------------------
function verificarImportMetaEnv(arquivo, fonte) {
  const apelidos = new Set()
  const ehImportMeta = (expr) => {
    const e = desembrulhar(expr)
    if (!e) return false
    if (ts.isMetaProperty(e) && e.keywordToken === ts.SyntaxKind.ImportKeyword && e.name.text === 'meta') return true
    return ts.isIdentifier(e) && apelidos.has(e.text)
  }
  const coletar = (no) => {
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer && ehImportMeta(no.initializer)) apelidos.add(no.name.text)
    ts.forEachChild(no, coletar)
  }
  let antes = -1
  while (antes !== apelidos.size) {
    antes = apelidos.size
    coletar(fonte)
  }
  const visitar = (no) => {
    if ((ts.isPropertyAccessExpression(no) || ts.isElementAccessExpression(no)) && nomeDaPropriedade(no) === 'env' && ehImportMeta(no.expression)) {
      registrar('G5', arquivo, fonte, no, 'import.meta.env fora de web/src/config/')
    }
    if (ts.isVariableDeclaration(no) && ts.isObjectBindingPattern(no.name) && no.initializer && ehImportMeta(no.initializer)) {
      for (const el of no.name.elements) {
        const chave = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : ''
        if (chave === 'env') registrar('G5', arquivo, fonte, el, 'desestruturação de import.meta.env fora de web/src/config/')
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
}

// --- R1: comentários de supressão -------------------------------------------
const SUPRESSAO = /(eslint-disable|eslint-enable|@ts-ignore|@ts-expect-error|@ts-nocheck)/
function verificarSupressoes(arquivo, fonte) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, fonte.languageVariant, fonte.text)
  let tipo = scanner.scan()
  while (tipo !== ts.SyntaxKind.EndOfFileToken) {
    if (tipo === ts.SyntaxKind.SingleLineCommentTrivia || tipo === ts.SyntaxKind.MultiLineCommentTrivia) {
      const m = scanner.getTokenText().match(SUPRESSAO)
      if (m) {
        const linha = fonte.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1
        violacoes.push({ id: 'R1', arquivo, linha, mensagem: `comentário de supressão "${m[1]}"` })
      }
    }
    tipo = scanner.scan()
  }
  // O scanner não entra em JSX e em templates; uma busca textual cobre o resto.
  fonte.text.split('\n').forEach((texto, i) => {
    const m = texto.match(new RegExp('(//|/\\*|\\{/\\*).*' + SUPRESSAO.source))
    if (m && !violacoes.some((v) => v.id === 'R1' && v.arquivo === arquivo && v.linha === i + 1)) {
      violacoes.push({ id: 'R1', arquivo, linha: i + 1, mensagem: 'comentário de supressão' })
    }
  })
}

// --- R2: endereço fixo fora de config/ --------------------------------------
const ENDERECO_FIXO = /(\blocalhost\b|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(^|["'`\s])\/tmp\/)/
function verificarEnderecosFixos(arquivo, fonte) {
  const visitar = (no) => {
    let texto
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) texto = no.text
    else if (ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no)) texto = no.text
    else if (ts.isJsxText(no)) texto = no.text
    if (texto !== undefined) {
      const m = texto.match(ENDERECO_FIXO)
      if (m) registrar('R2', arquivo, fonte, no, `endereço fixo "${m[0].trim()}" fora de config/ (porta, host e pastas vêm da configuração)`)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
}

for (const pasta of PASTAS) {
  for (const arquivo of listar(pasta)) {
    const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')
    const tipo = /\.(tsx|jsx)$/.test(arquivo) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, tipo)
    const emConfig = arquivo.startsWith(`${pasta}/config/`)
    if (pasta === 'api/src' && !emConfig) verificarProcessEnv(arquivo, fonte)
    if (pasta === 'web/src' && !emConfig) verificarImportMetaEnv(arquivo, fonte)
    verificarSupressoes(arquivo, fonte)
    if (!emConfig) verificarEnderecosFixos(arquivo, fonte)
  }
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(violacoes))
} else {
  for (const v of violacoes) console.log(`${v.id} ${v.arquivo}:${v.linha} ${v.mensagem}`)
}
process.exitCode = violacoes.length ? 1 : 0

// Comando único de gates do Balcão: npm run gates
//
// Roda TODAS as verificações (sem parar na primeira falha) e termina com a
// lista de violações, uma por linha: "<ID> <arquivo> <detalhe>".
// Sai com código 1 se qualquer regra falhar.
//
//   G1  tsc --noEmit em api/ e web/
//   G2  eslint em api/ e web/ (erro ou warning conta)
//   G3  vitest dos testes unitários (api/src/**/*.test.ts)
//   G4 G6 G7 G8 G9 R3  dependency-cruiser (.dependency-cruiser.cjs)
//   G5 R1 R2  scripts/gates/regras.mjs (AST do TypeScript)
//   G10 knip (knip.json)
//
// Opções: --only G1,G2   roda só os grupos que cobrem essas regras (o hook usa)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const bin = (pacote, nome) => path.join(RAIZ, pacote, 'node_modules', '.bin', nome)
const rel = (abs) => path.relative(RAIZ, path.resolve(abs)).split(path.sep).join('/')

const args = process.argv.slice(2)
const iOnly = args.indexOf('--only')
const somente = iOnly >= 0 ? new Set(args[iOnly + 1].split(',').map((s) => s.trim().toUpperCase())) : null

function executar(cmd, argv, cwd = RAIZ) {
  return new Promise((resolve) => {
    if (!fs.existsSync(cmd)) {
      resolve({ code: 127, stdout: '', stderr: `não encontrado: ${rel(cmd)} (rode npm run up ou npm ci)` })
      return
    }
    const p = spawn(cmd, argv, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    p.on('error', (err) => resolve({ code: 127, stdout, stderr: stderr + String(err) }))
    p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

const ultimas = (texto, n = 15) => texto.trim().split('\n').slice(-n).join('\n')

// Cada verificação devolve { violacoes: [{id, arquivo, detalhe}], erro?: string }
async function tipos() {
  const violacoes = []
  let erro = ''
  for (const pacote of ['api', 'web']) {
    const r = await executar(bin(pacote, 'tsc'), ['--noEmit', '-p', '.'], path.join(RAIZ, pacote))
    const saida = r.stdout + r.stderr
    let achou = false
    for (const linha of saida.split('\n')) {
      const m = linha.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/)
      if (m) {
        achou = true
        violacoes.push({ id: 'G1', arquivo: `${pacote}/${m[1]}`.replace(/\\/g, '/'), detalhe: `:${m[2]} ${m[4]} ${m[5]}` })
      }
    }
    if (r.code !== 0 && !achou) {
      violacoes.push({ id: 'G1', arquivo: `${pacote}/tsconfig.json`, detalhe: 'tsc falhou sem apontar arquivo' })
      erro += `\n[${pacote}] ${ultimas(saida)}`
    }
  }
  return { violacoes, erro }
}

async function lint() {
  const r = await executar(bin('.', 'eslint'), ['api', 'web', '-f', 'json', '--max-warnings', '0'])
  const violacoes = []
  try {
    for (const arquivo of JSON.parse(r.stdout)) {
      for (const m of arquivo.messages) {
        violacoes.push({ id: 'G2', arquivo: rel(arquivo.filePath), detalhe: `:${m.line ?? 0} ${m.ruleId ?? 'erro-de-parse'} ${m.message}` })
      }
    }
  } catch {
    violacoes.push({ id: 'G2', arquivo: 'eslint.config.mjs', detalhe: 'eslint não rodou' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  return { violacoes }
}

async function testes() {
  const saidaJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gates-')), 'vitest.json')
  const r = await executar(bin('api', 'vitest'), ['run', '--reporter=json', `--outputFile=${saidaJson}`], path.join(RAIZ, 'api'))
  const violacoes = []
  let relatorio
  try {
    relatorio = JSON.parse(fs.readFileSync(saidaJson, 'utf8'))
  } catch {
    violacoes.push({ id: 'G3', arquivo: 'api/vitest.config.mts', detalhe: 'vitest não gerou relatório' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  for (const arquivo of relatorio.testResults ?? []) {
    if (arquivo.status !== 'passed') {
      const falhos = (arquivo.assertionResults ?? []).filter((t) => t.status === 'failed').map((t) => t.fullName)
      const motivo = falhos.length ? `falhou: ${falhos.join('; ')}` : (arquivo.message || 'falhou').split('\n')[0]
      violacoes.push({ id: 'G3', arquivo: rel(arquivo.name), detalhe: motivo })
    }
  }
  if (r.code !== 0 && violacoes.length === 0) {
    violacoes.push({ id: 'G3', arquivo: 'api/vitest.config.mts', detalhe: 'vitest saiu com erro' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  return { violacoes }
}

async function dependencias() {
  const r = await executar(bin('.', 'depcruise'), ['api/src', 'web/src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'])
  const violacoes = []
  let dados
  try {
    dados = JSON.parse(r.stdout)
  } catch {
    violacoes.push({ id: 'G4', arquivo: '.dependency-cruiser.cjs', detalhe: 'dependency-cruiser não rodou (G4 G6 G7 G8 G9 R3)' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  for (const v of dados.summary.violations) {
    const ciclo = v.cycle?.length ? `ciclo: ${[v.from, ...v.cycle.map((c) => c.name ?? c)].join(' -> ')}` : `-> ${v.to}`
    violacoes.push({ id: v.rule.name, arquivo: v.from, detalhe: ciclo })
  }
  return { violacoes }
}

async function regrasAst() {
  const r = await executar(process.execPath, [path.join(RAIZ, 'scripts/gates/regras.mjs'), '--json'])
  try {
    const lista = JSON.parse(r.stdout)
    return { violacoes: lista.map((v) => ({ id: v.id, arquivo: v.arquivo, detalhe: `:${v.linha} ${v.mensagem}` })) }
  } catch {
    return { violacoes: [{ id: 'G5', arquivo: 'scripts/gates/regras.mjs', detalhe: 'verificador não rodou (G5 R1 R2)' }], erro: ultimas(r.stdout + r.stderr) }
  }
}

const TIPOS_DE_DEPENDENCIA = ['dependencies', 'devDependencies', 'optionalPeerDependencies', 'unlisted', 'binaries', 'unresolved']
const ROTULOS = {
  files: 'arquivo sem uso',
  exports: 'export sem uso',
  types: 'tipo exportado sem uso',
  nsExports: 'export de namespace sem uso',
  nsTypes: 'tipo de namespace sem uso',
  enumMembers: 'membro de enum sem uso',
  duplicates: 'export duplicado',
  dependencies: 'dependência sem uso',
  devDependencies: 'devDependency sem uso',
  optionalPeerDependencies: 'peerDependency opcional sem uso',
  unlisted: 'dependência usada e não declarada',
  binaries: 'binário não declarado',
  unresolved: 'import não resolvido',
}

async function codigoMorto() {
  const r = await executar(bin('.', 'knip'), ['--reporter', 'json', '--no-progress', '--no-config-hints'])
  const violacoes = []
  let dados
  try {
    dados = JSON.parse(r.stdout)
  } catch {
    violacoes.push({ id: 'G10', arquivo: 'knip.json', detalhe: 'knip não rodou' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  for (const item of dados.issues ?? []) {
    for (const [tipo, rotulo] of Object.entries(ROTULOS)) {
      const lista = item[tipo]
      if (!Array.isArray(lista)) continue
      for (const issue of lista) {
        if (tipo === 'files') {
          violacoes.push({ id: 'G10', arquivo: item.file, detalhe: rotulo })
        } else if (TIPOS_DE_DEPENDENCIA.includes(tipo)) {
          violacoes.push({ id: 'G10', arquivo: item.file, detalhe: `${issue.name} (${rotulo})` })
        } else {
          const nome = Array.isArray(issue) ? issue.map((i) => i.name).join(', ') : issue.name
          violacoes.push({ id: 'G10', arquivo: item.file, detalhe: `${nome} (${rotulo})` })
        }
      }
    }
  }
  if (r.code !== 0 && violacoes.length === 0) {
    violacoes.push({ id: 'G10', arquivo: 'knip.json', detalhe: 'knip saiu com erro' })
    return { violacoes, erro: ultimas(r.stdout + r.stderr) }
  }
  return { violacoes }
}

const GRUPOS = [
  { nome: 'tipos (tsc)', regras: ['G1'], fn: tipos },
  { nome: 'lint (eslint)', regras: ['G2'], fn: lint },
  { nome: 'testes unitários (vitest)', regras: ['G3'], fn: testes },
  { nome: 'dependências (dependency-cruiser)', regras: ['G4', 'G6', 'G7', 'G8', 'G9', 'R3'], fn: dependencias },
  { nome: 'env, supressões e endereços (AST)', regras: ['G5', 'R1', 'R2'], fn: regrasAst },
  { nome: 'código morto (knip)', regras: ['G10'], fn: codigoMorto },
]

const escolhidos = GRUPOS.filter((g) => !somente || g.regras.some((r) => somente.has(r)))
const inicio = Date.now()
const resultados = await Promise.all(
  escolhidos.map(async (g) => {
    try {
      return { grupo: g, ...(await g.fn()) }
    } catch (err) {
      return { grupo: g, violacoes: [{ id: g.regras[0], arquivo: 'scripts/gates/run.mjs', detalhe: 'verificação quebrou' }], erro: String(err) }
    }
  }),
)

let todas = []
for (const { grupo, violacoes, erro } of resultados) {
  const filtradas = somente ? violacoes.filter((v) => somente.has(v.id)) : violacoes
  const marca = filtradas.length ? '✖' : '✔'
  console.log(`${marca} ${grupo.regras.join(' ')}  ${grupo.nome}${filtradas.length ? `: ${filtradas.length} violação(ões)` : ''}`)
  if (erro) console.log(erro.replace(/^/gm, '    '))
  todas = todas.concat(filtradas)
}

// uma linha por violação, sem repetir a mesma linha
const vistas = new Set()
todas = todas.filter((v) => {
  const chave = `${v.id} ${v.arquivo} ${v.detalhe}`
  if (vistas.has(chave)) return false
  vistas.add(chave)
  return true
})
const ordem = (id) => (id.startsWith('G') ? Number(id.slice(1)) : 100 + Number(id.slice(1)))
todas.sort((a, b) => ordem(a.id) - ordem(b.id) || a.arquivo.localeCompare(b.arquivo))

const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
if (todas.length === 0) {
  console.log(`\nGates OK (${segundos}s).`)
  process.exit(0)
}
console.log(`\nViolações (${todas.length}) — regras em docs/gates.md:`)
for (const v of todas) console.log(`${v.id} ${v.arquivo}${v.detalhe.startsWith(':') ? '' : ' '}${v.detalhe}`)
process.exit(1)

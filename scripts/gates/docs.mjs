// R4 (regra própria): a documentação para agentes não mente.
// Todo caminho e todo comando citado entre crases no AGENTS.md precisa existir:
//   - `npm run <script>`       -> o script existe no package.json da pasta em que roda
//   - `npm test`               -> idem, script "test"
//   - `node <arq>`, `bash <arq>` -> o arquivo existe
//   - `cd <pasta> && ...`      -> a pasta existe (e os comandos seguintes rodam nela)
//   - caminho (tem "/" ou extensão) -> o arquivo ou a pasta existe
// Placeholders entre <> são aceitos (o AGENTS.md explica como preencher).
// `.balcao/...` é criado por `npm run up` e não é cobrado num clone sem subida.
//
// Uso: node scripts/gates/docs.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOCS = ['AGENTS.md']
const GERADOS_PELA_SUBIDA = ['.balcao/']
const EXTENSAO = /\.(md|mjs|cjs|js|ts|tsx|mts|json|sh|yml|yaml|prisma)$/

const violacoes = []
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel))

function scriptsDe(pasta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, pasta, 'package.json'), 'utf8')).scripts ?? {}
  } catch {
    return null
  }
}

function conferirComando(trecho, pasta, erro) {
  const partes = trecho.trim().split(/\s+/)
  if (partes[0] === 'cd') {
    const destino = path.posix.join(pasta, partes[1] ?? '')
    if (!existe(destino)) erro(`pasta inexistente em "cd": ${destino}`)
    return destino
  }
  if (partes[0] === 'npm') {
    const nome = partes[1] === 'run' ? partes[2] : ['test', 'start'].includes(partes[1]) ? partes[1] : null
    if (nome) {
      const scripts = scriptsDe(pasta)
      if (!scripts) erro(`sem package.json em ${pasta || '.'} para "${trecho.trim()}"`)
      else if (!scripts[nome]) erro(`script npm inexistente em ${pasta || '.'}/package.json: ${nome}`)
    }
    return pasta
  }
  if ((partes[0] === 'node' || partes[0] === 'bash') && partes[1] && !partes[1].startsWith('-')) {
    if (!existe(path.posix.join(pasta, partes[1]))) erro(`arquivo inexistente: ${partes[1]}`)
  }
  return pasta
}

function pareceCaminho(t) {
  if (/[\s<>*{}|]/.test(t) || t.startsWith('@') || t.startsWith('/') || t.includes('://') || t.includes('@')) return false
  return t.includes('/') || EXTENSAO.test(t)
}

for (const doc of DOCS) {
  const linhas = fs.readFileSync(path.join(RAIZ, doc), 'utf8').split('\n')
  linhas.forEach((texto, i) => {
    for (const [, trecho] of texto.matchAll(/`([^`]+)`/g)) {
      const erro = (mensagem) => violacoes.push({ id: 'R4', arquivo: doc, linha: i + 1, mensagem })
      // variáveis de ambiente na frente do comando (API_URL=... npm test)
      const semVariaveis = trecho.replace(/<[^>]*>/g, 'X').replace(/(^|&&\s*)([A-Z_]+=\S+\s+)+/g, '$1')
      if (/^(npm|node|bash|cd)\s/.test(semVariaveis)) {
        let pasta = ''
        for (const passo of semVariaveis.split('&&')) pasta = conferirComando(passo, pasta, erro)
        continue
      }
      if (!pareceCaminho(trecho)) continue
      if (GERADOS_PELA_SUBIDA.some((g) => trecho.startsWith(g))) continue
      if (!existe(trecho.replace(/\/$/, ''))) erro(`caminho inexistente: ${trecho}`)
    }
  })
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(violacoes))
} else {
  for (const v of violacoes) console.log(`${v.id} ${v.arquivo}:${v.linha} ${v.mensagem}`)
}
process.exitCode = violacoes.length ? 1 : 0

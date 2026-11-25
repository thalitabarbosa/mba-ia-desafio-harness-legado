// Remove uma dependência de api/ ou web/ sem reescrever o resto do package-lock.json.
// Motivo: `npm uninstall` (e `npm install`) em npm >= 10.9 reescrevem metadados de
// dezenas de pacotes do lockfile (docs/incidentes.md, incidente 1).
// Uso: node scripts/remover-dependencia.mjs <api|web> <pacote>
// Depois rode `npm ci` na pasta (ou `npm run up`).
import fs from 'node:fs'
import path from 'node:path'

const [pasta, pacote] = process.argv.slice(2)
if (!['api', 'web'].includes(pasta) || !pacote) {
  console.error('Uso: node scripts/remover-dependencia.mjs <api|web> <pacote>')
  process.exit(2)
}
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', pasta)
const lerJson = (f) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8'))
const gravarJson = (f, dados) => fs.writeFileSync(path.join(raiz, f), JSON.stringify(dados, null, 2) + '\n')

const pkg = lerJson('package.json')
const lock = lerJson('package-lock.json')
let achou = false
for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (pkg[campo]?.[pacote]) {
    delete pkg[campo][pacote]
    delete lock.packages[''][campo]?.[pacote]
    achou = true
  }
}
if (!achou) {
  console.error(`${pacote} não está declarado em ${pasta}/package.json`)
  process.exit(1)
}

// Tira do lock os pacotes que só existiam por causa dele.
const usados = new Set()
const visitar = (dono, nome) => {
  const candidatos = [`${dono ? dono + '/' : ''}node_modules/${nome}`, `node_modules/${nome}`]
  const chave = candidatos.find((c) => lock.packages[c])
  if (!chave || usados.has(chave)) return
  usados.add(chave)
  const entrada = lock.packages[chave]
  for (const campo of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dep of Object.keys(entrada[campo] ?? {})) visitar(chave, dep)
  }
}
const raizLock = lock.packages['']
for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const dep of Object.keys(raizLock[campo] ?? {})) visitar('', dep)
}
const removidos = Object.keys(lock.packages).filter((k) => k !== '' && !usados.has(k))
for (const k of removidos) delete lock.packages[k]

gravarJson('package.json', pkg)
gravarJson('package-lock.json', lock)
console.log(`${pacote} removido de ${pasta}/. Entradas tiradas do lock: ${removidos.join(', ') || 'nenhuma'}`)

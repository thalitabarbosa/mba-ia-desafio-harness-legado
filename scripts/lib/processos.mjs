// Utilitários dos scripts de ambiente. Em Node para rodar igual no Linux e no macOS
// (sem depender de lsof, setsid, ss ou da versão do bash).
//
//   node processos.mjs porta-livre <a partir de> [ocupadas...]  -> imprime a 1a porta livre
//   node processos.mjs porta-ocupada <porta>                    -> sai 0 se ocupada
//   node processos.mjs iniciar <pidfile> <logfile> <cwd> -- <cmd> [args...]
//   node processos.mjs parar <pidfile>                          -> encerra o grupo de processos
//   node processos.mjs vivo <pidfile>                           -> sai 0 se o grupo está vivo
//   node processos.mjs esperar <url> <segundos>                 -> espera responder 2xx
//   node processos.mjs id <caminho>                             -> id curto e estável da cópia
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'

const [comando, ...args] = process.argv.slice(2)

function escutaLivre(porta, host) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', (err) => resolve(err.code !== 'EADDRINUSE' && err.code !== 'EACCES'))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen({ port: porta, host, exclusive: true })
  })
}

function alguemAtende(porta, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port: porta, host })
    const fim = (r) => {
      s.destroy()
      resolve(r)
    }
    s.setTimeout(300, () => fim(false))
    s.once('connect', () => fim(true))
    s.once('error', () => fim(false))
  })
}

async function ocupada(porta) {
  for (const host of ['127.0.0.1', '::1']) if (await alguemAtende(porta, host)) return true
  for (const host of ['0.0.0.0', '::']) if (!(await escutaLivre(porta, host))) return true
  return false
}

function lerPid(arquivo) {
  try {
    const pid = Number(fs.readFileSync(arquivo, 'utf8').trim())
    return Number.isInteger(pid) && pid > 1 ? pid : null
  } catch {
    return null
  }
}

function grupoVivo(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const acoes = {
  async 'porta-livre'() {
    const inicio = Number(args[0])
    const evitar = new Set(args.slice(1).map(Number))
    for (let p = inicio; p < inicio + 500; p++) {
      if (evitar.has(p)) continue
      if (!(await ocupada(p))) {
        console.log(p)
        return 0
      }
    }
    console.error(`nenhuma porta livre entre ${inicio} e ${inicio + 499}`)
    return 1
  },

  async 'porta-ocupada'() {
    return (await ocupada(Number(args[0]))) ? 0 : 1
  },

  async iniciar() {
    const [pidfile, logfile, cwd, separador, cmd, ...resto] = args
    if (separador !== '--' || !cmd) throw new Error('uso: iniciar <pidfile> <logfile> <cwd> -- <cmd> [args...]')
    const log = fs.openSync(logfile, 'a')
    // detached: o filho vira líder de um grupo de processos próprio; `parar` mata o grupo
    // inteiro (tsx watch, vite e os filhos deles) sem tocar em processos de outras cópias.
    const filho = spawn(cmd, resto, { cwd, detached: true, stdio: ['ignore', log, log], env: process.env })
    filho.unref()
    fs.writeFileSync(pidfile, `${filho.pid}\n`)
    console.log(filho.pid)
    return 0
  },

  async parar() {
    const pid = lerPid(args[0])
    if (!pid) return 0
    if (grupoVivo(pid)) {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // já tinha saído
      }
      for (let i = 0; i < 50 && grupoVivo(pid); i++) await dormir(200)
      if (grupoVivo(pid)) {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // já tinha saído
        }
      }
    }
    fs.rmSync(args[0], { force: true })
    return 0
  },

  async vivo() {
    const pid = lerPid(args[0])
    return pid && grupoVivo(pid) ? 0 : 1
  },

  async esperar() {
    const [url, segundos = '60'] = args
    const limite = Date.now() + Number(segundos) * 1000
    while (Date.now() < limite) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (r.ok) return 0
      } catch {
        // ainda subindo
      }
      await dormir(500)
    }
    return 1
  },

  async id() {
    console.log(crypto.createHash('sha1').update(args[0]).digest('hex').slice(0, 8))
    return 0
  },
}

if (!acoes[comando]) {
  console.error(`comando desconhecido: ${comando}`)
  process.exit(2)
}
process.exit(await acoes[comando]())

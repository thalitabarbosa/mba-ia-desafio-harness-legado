# Registro de incidentes

Cada entrada é um erro real de um agente (Claude Code, Claude Opus 5.5) durante a instalação deste harness e a mudança no harness que impede que ele se repita. `git show --stat <hash>` mostra a mudança.

Novas entradas: o que aconteceu, por que o harness deixou acontecer, o que mudou e o commit.

---

## 1. `npm uninstall` reescreveu o lockfile inteiro

- **O que aconteceu.** Para tirar o `lodash` (sem uso, G10), o agente rodou `npm uninstall lodash` em `api/`. Além de remover o `lodash`, o npm 10.9 acrescentou `"peer": true` em dezenas de pacotes do `api/package-lock.json` que não tinham nada a ver com a mudança: um diff de 51 linhas para tirar uma dependência. O agente só percebeu ao conferir o `git diff --stat`.
- **Por que o harness deixou.** Nada dizia como mexer em dependências, e o `CLAUDE.md` antigo mandava rodar `npm install` antes de qualquer comando.
- **Mudança no harness.**
  - `scripts/remover-dependencia.mjs`: remove a dependência do `package.json` e do lockfile, junto com os pacotes que só existiam por causa dela, sem tocar no resto. Usado para tirar `lodash` e `axios`; `npm ci` aceitou os dois lockfiles.
  - `npm run up` instala só com `npm ci` (respeita o lockfile) e só quando o lock muda.
  - `AGENTS.md`, seção "Não faça": não rodar `npm install`/`npm uninstall` soltos; usar `npm run up` e o script.
- **Commit:** `09e7acc` (script e lockfiles); a regra no `AGENTS.md` entrou em `f96eb42`.

## 2. Uma opção do dependency-cruiser desligou G6 e G7 sem aviso

- **O que aconteceu.** A primeira versão de `.dependency-cruiser.cjs` tinha `exclude: { path: 'node_modules' }`. A intenção era não analisar as dependências por dentro, mas o efeito foi tirar da análise todo import que resolve para `node_modules`: `import type { Request } from 'express'` em `services/` (G6) e `import OpenAI from 'openai'` em `http/` (G7) sumiram da saída. O comando rodou sem erro, e só ficou claro porque o agente comparou a saída com as violações que sabia existir no código. Com o código corrigido, os gates teriam passado com essas duas regras desligadas.
- **Por que o harness deixou.** O `kit-gates/` só testa uma forma de escrever cada violação, e o agente ainda não o rodava a cada mudança de configuração.
- **Mudança no harness.**
  - `harness/kit/`: kit no formato do `kit-gates/` (usa o mesmo `verificar.sh`) com 28 variações das mesmas regras: `import { type X }`, `import('multer').Multer` em posição de tipo, `export type { Request } from 'express'`, `import x = require('@prisma/client')`, import dinâmico, re-export, `process['env']`, `const { env } = process`, `globalThis.process.env`, `import { env } from 'node:process'`, `import.meta['env']`, ciclo de três arquivos, ciclo em `.tsx` e outras.
  - `AGENTS.md` e `docs/gates.md`: mexeu em `eslint.config.mjs`, `.dependency-cruiser.cjs`, `knip.json` ou `scripts/gates/`, rode os dois kits.
- **Commit:** `e8d1696`.

## 3. O knip analisou a pasta errada

- **O que aconteceu.** Na primeira configuração do knip (G10), o agente declarou só os workspaces `api` e `web`. O knip tratou a raiz como workspace implícito e acusou os 9 arquivos de `blackbox/` como "arquivo sem uso", além de não enxergar os scripts dos gates. A correção tinha de restringir o escopo sem esconder nada de `api/src` e `web/src`: um `ignore` genérico também esconderia violações de verdade, o que o enunciado proíbe.
- **Por que o harness deixou.** Não havia regra sobre o escopo de cada ferramenta.
- **Mudança no harness.** `knip.json` declara o workspace raiz explicitamente: entrada em `scripts/**/*.mjs` e `ignore` restrito a `blackbox/**` e `kit-gates/**`, que estão fora de G10. `api/` e `web/` não têm nenhum `ignore`. O script de cada ferramenta virou script npm (`npm run lint`, `npm run deps`, `npm run deadcode`), o que também faz o knip reconhecer as ferramentas da raiz como usadas, sem lista de exceções.
- **Commit:** `0020c18`.

## 4. O primeiro `AGENTS.md` citava caminhos que não existem

- **O que aconteceu.** O agente escreveu a primeira versão do `AGENTS.md` com caminhos relativos à pasta da API: `config/`, `http/`, `repositories/`, `main.ts`, `jobs/triage-worker.ts` e `.env`. A partir da raiz, onde o agente seguinte abre a sessão, nenhum existe. É o mesmo defeito do `CLAUDE.md` antigo (`npm run migrate`, `api/src/controllers/`, `api/tests/`), repetido pelo agente que estava substituindo esse arquivo. Foi pego por uma conferência manual, caminho a caminho.
- **Por que o harness deixou.** "Todo comando e caminho citado existe" era uma regra só no papel; nada verificava.
- **Mudança no harness.** Regra própria R4 nos gates (`scripts/gates/docs.mjs`): confere cada trecho entre crases do `AGENTS.md`. Script npm existe no `package.json` da pasta certa (segue os `cd`), arquivo de `node`/`bash` existe, caminho existe. Roda em `npm run gates` e, portanto, no hook de pre-commit. Exemplo de violação: `harness/exemplos/R4-agents-cita-o-que-nao-existe.patch`.
- **Commit:** `0179f29`.

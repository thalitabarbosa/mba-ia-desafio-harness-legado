# Gates

`npm run gates` (na raiz) roda todas as verificações, sem parar na primeira falha, e termina com uma linha por violação:

```
G4 api/src/http/routes/stats.ts -> api/src/repositories/prisma.ts
G10 api/package.json left-pad (dependência sem uso)
```

Formato: `<regra> <arquivo>[:linha] <detalhe>`. Sai com código 1 se qualquer regra falhar. `npm run gates -- --only G1,G2` roda só os grupos dessas regras.

Orquestrador: [`scripts/gates/run.mjs`](../scripts/gates/run.mjs).

## Regras

| ID | Regra | Ferramenta | Configuração |
|---|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` de cada pacote | `api/tsconfig.json`, `web/tsconfig.json` |
| G2 | Lint sem erro nem warning (variável/import sem uso, `any` explícito) | ESLint + typescript-eslint | `eslint.config.mjs` |
| G3 | Testes unitários da API passam | Vitest (`api/src/**/*.test.ts`) | `api/vitest.config.mts` |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | verificador AST próprio | `scripts/gates/regras.mjs` |
| G6 | `api/src/services/` não importa `express`, `multer` nem `api/src/http/` (nem só de tipo) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G7 | `openai` só é importado em `api/src/integrations/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G8 | `web/` não importa nada de `api/` (nem só de tipo) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G9 | Nenhum import circular em `api/src/` nem `web/src/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G10 | Nenhum arquivo, export (inclusive tipo) ou dependência sem uso em `api/` e `web/` | knip | `knip.json` |
| R1 | Nenhum comentário de supressão (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) em `api/src` e `web/src` | verificador AST próprio | `scripts/gates/regras.mjs` |
| R2 | Nenhum endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `/tmp/`) fora de `api/src/config/` e `web/src/config/` | verificador AST próprio | `scripts/gates/regras.mjs` |
| R3 | `@prisma/client` só em `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |

### Imports só de tipo (G6, G8)

`tsc` apaga `import type` na compilação, então ferramentas que olham o JavaScript não veem esses imports. O dependency-cruiser roda com `tsPreCompilationDeps: true`, que lê o TypeScript antes da compilação e registra `import type`, `import { type X }`, `export type { X } from`, `import('x')` em posição de tipo e `import x = require('x')`. Os pacotes são reconhecidos pelo caminho resolvido, inclusive `@types/express`.

### G5 por AST, não por texto

Uma busca por `process.env` deixaria passar `process['env']`, `const { env } = process`, `globalThis.process.env`, `import { env } from 'node:process'` e apelidos (`const p = process; p.env`). O verificador percorre a AST do TypeScript e pega essas formas, e as equivalentes de `import.meta.env` no front.

### Sem exclusões

- Nenhum arquivo de `api/src` ou `web/src` fica fora das ferramentas. As únicas exceções são as que a própria regra define: `api/src/config/` e `web/src/config/` em G5 e R2.
- `eslint.config.mjs` usa `noInlineConfig: true`: comentário `eslint-disable` não tem efeito, e R1 ainda acusa o comentário.

## Regras próprias: motivação

- **R1 — sem supressão.** O `CLAUDE.md` antigo mandava usar `any` "para não travar a entrega". Um agente pressionado por gate vermelho tende a calar a ferramenta em vez de corrigir o código. `@ts-ignore` esconde de G1 o erro de tipo que G1 deveria barrar (veja o exemplo `R1-a`).
- **R2 — sem endereço fixo fora de config/.** Foi a primeira trava da segunda worktree: CORS preso em `http://localhost:5173`, front chamando `http://localhost:4000` em três arquivos e anexos em `/tmp/balcao/uploads`, a mesma pasta para todas as cópias. Com o endereço vindo da configuração, `npm run up` dá a cada cópia o seu.
- **R3 — Prisma só nos repositórios.** O worker criava o próprio `PrismaClient` com `process.env.DATABASE_URL`, fora da configuração e dos repositórios. G4 só protege `http/`; R3 protege serviços, worker e integrações.

## Exemplos de violação das regras próprias

Ficam em `harness/kit/violacoes/R*` no formato do `kit-gates/`. Para aplicar (com `git status` limpo e dependências instaladas):

```bash
bash harness/kit/verificar.sh . "npm run gates" R1
bash harness/kit/verificar.sh . "npm run gates" R2
bash harness/kit/verificar.sh . "npm run gates" R3
```

O script planta cada violação, roda os gates, confere a linha com o ID e o arquivo e desfaz tudo. Para aplicar um exemplo à mão, copie o `.modelo` para o caminho indicado sem a extensão (ex.: `harness/kit/violacoes/R2-a-url-fixa-no-front/arquivos/web/src/api/relatorios.ts.modelo` → `web/src/api/relatorios.ts`), rode `npm run gates` e apague o arquivo.

## Mexeu na configuração de um gate? Rode os dois kits

Uma opção errada desliga uma regra sem aviso, e os gates continuam passando (aconteceu: [incidente 2](incidentes.md)).

```bash
bash kit-gates/verificar.sh . "npm run gates"     # violações do kit oficial
bash harness/kit/verificar.sh . "npm run gates"   # outras formas de escrever os mesmos erros + R1-R3
```

Os dois precisam terminar com "todas as violacoes foram barradas".

## Como corrigir as violações mais comuns

| Violação | Correção |
|---|---|
| G4 rota usa repositório | Crie ou use um método de serviço; repositórios são ligados em `api/src/composition.ts` |
| G5 `process.env` fora de config | Acrescente a variável no schema de `api/src/config/env.ts` e importe `env` |
| G6 serviço usa `Request`/`HttpError` | Receba dados simples (ex.: `CurrentUser`, `UploadedFile`) e lance `AppError` de `api/src/domain/errors.ts` |
| G8 front usa tipo da API | Declare o tipo do contrato HTTP em `web/src/api/` |
| G10 export sem uso | Tire o `export` (ou o código, se ninguém usa) |
| G10 dependência sem uso | `node scripts/remover-dependencia.mjs <api\|web> <pacote>` e depois `npm run up` |

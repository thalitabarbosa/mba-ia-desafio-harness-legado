# AGENTS.md — Balcão

Central de chamados: API Express + Prisma + Postgres (`api/`), worker de triagem por IA
(`api/src/jobs/triage-worker.ts`, IA em modo fake por padrão) e front React + Vite (`web/`).
Responda em português. Este arquivo é o índice; o detalhe está em `docs/`.

## Comandos (na raiz da cópia: clone ou worktree)

- `npm run up` — sobe banco, migrations, seed, API, worker e front desta cópia e imprime
  os endereços. Idempotente: rode de novo quando mudar dependência, configuração ou schema.
- `npm run down` — derruba só esta cópia (`npm run down -- --apagar-dados` zera o banco).
- `npm run gates` — todas as verificações; a lista final traz `<regra> <arquivo>`.
  Rode antes de dizer que terminou. O hook de pre-commit roda o mesmo comando.
- `cd blackbox && npm ci && API_URL=<API impressa pelo up> npm test` — contrato HTTP.
- Logs e portas da cópia: `.balcao/logs/`, `.balcao/portas`.

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Regras de camada (barradas por `npm run gates`)

- `api/src/http/` fala só com serviços: sem `@prisma/client`, sem `api/src/repositories/` (G4).
- `api/src/services/` não conhece `express`, `multer` nem `api/src/http/`, nem só de tipo (G6);
  erro de negócio é `AppError` de `api/src/domain/errors.ts`.
- `@prisma/client` só em `api/src/repositories/` (R3); `openai` só em `api/src/integrations/` (G7).
- Repositórios e serviços são ligados em `api/src/composition.ts`.
- `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` (G5).
- Nada de `localhost`, porta ou `/tmp/` fixo fora de `api/src/config/` e `web/src/config/` (R2):
  várias cópias rodam juntas.
- `web/` não importa nada de `api/` (G8). Nenhum import circular (G9).
- Nada sem uso: arquivo, export, tipo ou dependência (G10). Sem `any` explícito (G2).
- Nunca silencie uma ferramenta: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
  `@ts-nocheck` são barrados (R1), e excluir arquivo da verificação não vale.

## Não faça

- Não mude rotas, corpos, status ou códigos de erro da API: `blackbox/` é o contrato.
- Não mova nem renomeie as pastas de `api/src/` (config, domain, http, services, repositories,
  integrations), `api/src/main.ts`, `api/src/jobs/triage-worker.ts`, `web/src/main.tsx`
  nem o padrão `api/src/**/*.test.ts`: é onde os gates procuram.
- Não rode `npm install`/`npm uninstall` soltos: reescrevem o lockfile. Para instalar use
  `npm run up` (faz `npm ci`); para remover use `node scripts/remover-dependencia.mjs <api|web> <pacote>`.
- Não mate processo por porta: pode ser de outra cópia. Use `npm run down`.
- Mexeu em `eslint.config.mjs`, `.dependency-cruiser.cjs`, `knip.json` ou `scripts/gates/`?
  Rode `bash kit-gates/verificar.sh . "npm run gates"` e `bash harness/kit/verificar.sh . "npm run gates"`.

## Onde está o detalhe

- `docs/arquitetura.md` — camadas, quem importa quem, variáveis de ambiente, testes.
- `docs/gates.md` — cada regra, ferramenta, motivação das regras próprias, como corrigir.
- `docs/ambiente.md` — o que a subida faz, isolamento entre cópias, problemas comuns.
- `docs/incidentes.md` — erros de agentes e a mudança no harness que evita cada um.

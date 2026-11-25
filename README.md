# Balcão

Central de chamados. Clientes abrem chamados, uma IA faz a triagem (categoria e prioridade) em segundo plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma + Postgres e o worker de triagem.
- `web/`: front em React + Vite.
- `blackbox/`: testes caixa-preta da API (o contrato HTTP).

Este repositório tem um *harness* para que pessoas e agentes de código trabalhem em várias cópias ao mesmo tempo: um comando sobe tudo, outro derruba, e os gates barram o que foge das regras. Agentes começam pelo [AGENTS.md](AGENTS.md).

## Como rodar

### Pré-requisitos

- Linux ou macOS (no Windows, use o WSL)
- Node.js 22 ou superior (LTS)
- Docker com `docker compose` v2, rodando
- Git

Nada mais precisa estar instalado: o Postgres roda em container e as dependências de Node são instaladas pela subida.

### Comandos

Na raiz do clone (ou de qualquer worktree):

| Comando | O que faz |
|---|---|
| `npm run up` | Sobe o Balcão desta cópia: instala dependências (`npm ci`), sobe o Postgres, roda migrations e seed, inicia API, worker e front, e ativa o hook do Git. Pode rodar de novo sem derrubar antes. |
| `npm run down` | Derruba tudo o que a subida desta cópia iniciou (API, worker, front e o container do Postgres), sem tocar em outras cópias. Os dados ficam no volume. |
| `npm run down -- --apagar-dados` | Idem, e apaga o banco da cópia. |
| `npm run gates` | Roda todas as verificações (G1 a G10 e R1 a R3) e lista as violações, uma por linha. |

### O que a subida informa

No fim, `npm run up` imprime algo assim (as portas mudam quando as padrão já estão ocupadas por outra cópia):

```
Balcão no ar (balcao-copia-a-1f2e3d4c)
  Front:   http://localhost:5173
  API:     http://localhost:4000   (saúde: http://localhost:4000/api/health)
  Banco:   postgresql://balcao:balcao@localhost:5432/balcao   (container do projeto compose balcao-copia-a-1f2e3d4c)
  Anexos:  /caminho/da/copia/.balcao/uploads
  Worker:  triagem a cada 2s, IA em modo fake
  Logs:    /caminho/da/copia/.balcao/logs
  Derrubar esta cópia: npm run down
```

Duas cópias ao mesmo tempo:

```bash
git clone <este repositório> copia-a && cd copia-a && npm run up
git worktree add ../copia-b && cd ../copia-b && npm run up
```

Testes:

```bash
cd api && npx vitest run            # unitários (sem banco)
cd api && npm run test:integration  # integração, no banco balcao_test da cópia
cd blackbox && npm ci && API_URL=<API impressa pelo up> npm test   # caixa-preta
```

Detalhes da subida, do isolamento e de problemas comuns: [docs/ambiente.md](docs/ambiente.md).

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

A IA roda em modo fake por padrão (classifica por palavras-chave, sem chave nenhuma). Para usar a OpenAI, suba com as variáveis no ambiente (elas têm precedência sobre o `api/.env` gerado): `AI_MODE=openai OPENAI_API_KEY=<chave> npm run up`.

## Gates

`npm run gates` termina com uma linha por violação, no formato `<regra> <arquivo>[:linha] <detalhe>`, e sai com código diferente de zero se qualquer regra falhar. Ele roda todas as verificações mesmo quando uma falha.

| Regra | O que barra | Ferramenta |
|---|---|---|
| G1 | Erro de tipo em `api/` e `web/` | `tsc --noEmit` |
| G2 | Lint com erro ou warning (variável/import sem uso, `any` explícito) | ESLint + typescript-eslint (`eslint.config.mjs`) |
| G3 | Teste unitário da API falhando (`api/src/**/*.test.ts`) | Vitest |
| G4 | `api/src/http/` importando `@prisma/client` ou `api/src/repositories/` | dependency-cruiser (`.dependency-cruiser.cjs`) |
| G5 | `process.env` fora de `api/src/config/`; `import.meta.env` fora de `web/src/config/` | verificador AST próprio (`scripts/gates/regras.mjs`) |
| G6 | `api/src/services/` importando `express`, `multer` ou `api/src/http/`, inclusive só de tipo | dependency-cruiser |
| G7 | `openai` importado fora de `api/src/integrations/` | dependency-cruiser |
| G8 | `web/` importando qualquer arquivo de `api/`, inclusive só de tipo | dependency-cruiser |
| G9 | Import circular em `api/src/` ou `web/src/` | dependency-cruiser |
| G10 | Arquivo, export, tipo ou dependência sem uso em `api/` e `web/` | knip (`knip.json`) |
| R1 | Comentário de supressão (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) em `api/src` e `web/src` | verificador AST próprio |
| R2 | Endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, `/tmp/`) fora das pastas `config/` | verificador AST próprio |
| R3 | `@prisma/client` importado fora de `api/src/repositories/` | dependency-cruiser |

R1, R2 e R3 são regras próprias; a motivação de cada uma está em [docs/gates.md](docs/gates.md#regras-próprias-motivação).

**Hook do Git.** `.githooks/pre-commit` roda `npm run gates` (que inclui tipo e lint) e bloqueia o commit se algo falhar. `npm run up` o ativa com `git config core.hooksPath .githooks`.

**Aplicar os exemplos de violação das regras próprias.** Os exemplos estão versionados em `harness/kit/violacoes/R*`, no formato do `kit-gates/`. Com `git status` limpo e a subida feita:

```bash
bash harness/kit/verificar.sh . "npm run gates" R1   # @ts-ignore escondendo erro de tipo; eslint-disable no front
bash harness/kit/verificar.sh . "npm run gates" R2   # URL fixa da API no front; pasta /tmp fixa na API
bash harness/kit/verificar.sh . "npm run gates" R3   # worker criando o próprio PrismaClient
```

Cada rodada planta o exemplo, roda os gates, confere a linha com a regra e o arquivo e desfaz. Para aplicar à mão, copie o `.modelo` para o caminho indicado dentro de `arquivos/`, sem a extensão `.modelo`, e rode `npm run gates`.

**Testar os gates.** `bash kit-gates/verificar.sh . "npm run gates"` roda o kit oficial; `bash harness/kit/verificar.sh . "npm run gates"` roda o nosso, com outras formas de escrever as mesmas violações (import só de tipo por `import('x')`, `process['env']`, `const { env } = process`, re-export, ciclo de três arquivos…) além dos exemplos de R1 a R3.

## Decisões

**Como as cópias foram isoladas.** O Balcão achava que era a única cópia no mundo: portas 4000/5173/5432 fixas, CORS preso em `http://localhost:5173`, front com `http://localhost:4000` em três arquivos, anexos em `/tmp/balcao/uploads`, um único Postgres no compose e uma seed que quebrava na segunda subida. Agora:

- cada cópia sobe o próprio Postgres (`docker compose -p balcao-<pasta>-<hash do caminho>`, volume próprio), numa porta livre;
- API e front pegam a primeira porta livre a partir de 4000 e 5173, e a cópia reaproveita as mesmas portas na próxima subida (`.balcao/portas`);
- `npm run up` gera `api/.env` e `web/.env.local` da cópia: banco, porta, `CORS_ORIGIN` igual ao front da cópia, `VITE_API_URL` igual à API da cópia e `UPLOAD_DIR` em `.balcao/uploads`;
- API, worker e front sobem em segundo plano, cada um no próprio grupo de processos, com o PID guardado em `.balcao/pids`; `npm run down` encerra esses grupos e o container da cópia, e nada mais;
- a seed virou idempotente (upsert dos usuários; chamados de exemplo só criados se não existem);
- os utilitários de porta e processo são Node (`scripts/lib/processos.mjs`), para rodar igual no Linux e no macOS sem `lsof` nem `setsid`.

**Como as violações que já existiam foram corrigidas.** Os gates foram escritos primeiro e acenderam 89 violações; o código foi corrigido guiado por essa lista, sem supressões nem exclusões, e a suíte caixa-preta continuou com 51 de 51.

- G4: as rotas viraram fábricas que recebem serviços (`createApp(services)`); `api/src/composition.ts` liga repositórios, integrações e serviços. Saúde e estatísticas ganharam serviço e repositório próprios, a sugestão de resposta foi para `SuggestionService` e o `/auth/me` para `AuthService.getProfile`.
- G5: `api/src/config/env.ts` (schema zod, com os mesmos padrões de antes) e `web/src/config/env.ts` são os únicos leitores de ambiente.
- G6: `HttpError` virou `AppError` em `api/src/domain/errors.ts`; `AttachmentService.upload` recebe o usuário e o arquivo, não o `Request`; o usuário autenticado fica em `res.locals.user`.
- G7: a rota de sugestão chamava a OpenAI direto; agora usa `suggestReply` de `api/src/integrations/ai-client.ts`.
- G8: o front declara os tipos do contrato HTTP em `web/src/api/tickets.ts`.
- G9: `formatTicketRef` subiu para o domínio, desfazendo o ciclo `ticket-service` ↔ `notification-service`.
- G10: saíram `utils/legacy-sla.ts`, `calculateSlaDeadline`, `formatCurrency`, exports desnecessários e as dependências `lodash` e `axios`.
- G2: `any` trocado por tipos do domínio, `unknown` com checagem e `catch` sem variável. O worker passou a usar `TriageService` e o repositório (R3).

**O que mudou na documentação para agentes.** O `CLAUDE.md` antigo mentia: mandava rodar `npm run migrate` (não existe), citava `api/src/controllers/`, `api/tests/` e `web/src/store/` (não existem), mandava usar `any` para "não travar", `kill -9` em quem estivesse na porta e nunca rodar a seed duas vezes. Ele saiu de cena e agora só aponta para o `AGENTS.md`, um índice de menos de 60 linhas com comandos, contas, regras de camada e o que não fazer; o detalhe foi para `docs/` (progressive disclosure):

- [docs/arquitetura.md](docs/arquitetura.md): camadas, quem importa quem, variáveis de ambiente, testes;
- [docs/gates.md](docs/gates.md): cada regra, ferramenta, motivação das regras próprias, como corrigir;
- [docs/ambiente.md](docs/ambiente.md): subida, isolamento, problemas comuns.

Todo comando e caminho citado no `AGENTS.md` existe. A cada erro de agente, o harness muda e o registro aponta o commit.

## Registro de incidentes

[docs/incidentes.md](docs/incidentes.md)

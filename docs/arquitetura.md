# Arquitetura e regras de camada

## API (`api/src/`)

```
main.ts              entrada da API: config + composition + createApp
composition.ts       único lugar que liga repositórios, integrações e serviços
config/env.ts        único leitor de process.env (schema zod com os padrões)
domain/              tipos, AppError e funções puras; não importa ninguém
http/                Express: app, rotas (fábricas que recebem serviços), middlewares, erros
services/            regras de negócio; recebem repositórios e funções por construtor
repositories/        Prisma; o único lugar que importa @prisma/client
integrations/        cliente de IA (fake e openai); o único lugar que importa openai
jobs/triage-worker.ts  entrada do worker: config + composition + TriageService
```

Quem pode importar quem:

| De \ Para | domain | config | repositories | services | integrations | http | express/multer | @prisma/client | openai |
|---|---|---|---|---|---|---|---|---|---|
| http | sim | sim | **não (G4)** | sim | não precisa | sim | sim | **não (G4)** | **não (G7)** |
| services | sim | evite* | sim | sim | só tipos | **não (G6)** | **não (G6)** | **não (R3)** | **não (G7)** |
| repositories | sim | sim | sim | não | não | não | não | sim | não |
| integrations | sim | sim | não | não | sim | não | não | não | sim |
| jobs, composition, main | sim | sim | sim | sim | sim | só main | não | **não (R3)** | **não (G7)** |

\* Serviços recebem a configuração por construtor (ex.: `uploadDir` no `AttachmentService`), o que facilita os testes.

Erros de negócio: lance `AppError(status, code, message)` (`domain/errors.ts`). O `errorHandler` de `http/errors.ts` transforma em `{"error": code, "message": message}`. O usuário autenticado fica em `res.locals.user`; nas rotas use `currentUser(res)`.

Nenhum ciclo de import (G9): o que dois módulos compartilham sobe para `domain/`.

## Front (`web/src/`)

```
main.tsx       entrada
config/env.ts  único leitor de import.meta.env (VITE_API_URL)
api/           chamadas HTTP e tipos do contrato; não importa nada de api/ (G8)
pages/, components/, utils/
```

## Configuração (variáveis de ambiente da API)

Todas definidas em `api/src/config/env.ts`. O `npm run up` gera `api/.env` e `web/.env.local` de cada cópia (os dois são ignorados pelo Git e refeitos a cada subida).

| Variável | Padrão | O que é |
|---|---|---|
| `DATABASE_URL` | — | banco da cópia |
| `PORT` | 4000 | porta da API |
| `CORS_ORIGIN` | `http://localhost:5173` | endereço do front da cópia |
| `UPLOAD_DIR` | `/tmp/balcao/uploads` | pasta de anexos (a subida usa `.balcao/uploads` da cópia) |
| `AI_MODE` | `fake` | `openai` usa a OpenAI (precisa de `OPENAI_API_KEY`) |
| `JWT_SECRET` | `dev-secret` | segredo do token |
| `TRIAGE_INTERVAL_MS` | 2000 | intervalo do worker |
| `VITE_API_URL` (front) | `http://localhost:4000` | API que o front chama |

## Testes

- Unitários: ao lado do código, `api/src/**/*.test.ts`, sem banco (`cd api && npx vitest run`). Use repositórios falsos que implementam as interfaces de `repositories/`.
- Integração: `api/test/integration/`, usam o banco `balcao_test` da cópia, que a subida cria e migra (`cd api && npm run test:integration`).
- Caixa-preta: `blackbox/`, contrato HTTP. Com a cópia no ar: `cd blackbox && npm ci && API_URL=<API da cópia> npm test`.

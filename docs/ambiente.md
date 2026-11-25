# Ambiente local

## Subir e derrubar

```bash
npm run up      # sobe esta cópia; pode rodar de novo sem derrubar
npm run down    # derruba só o que a subida desta cópia iniciou
npm run down -- --apagar-dados   # idem, e apaga o volume do banco da cópia
```

`npm run up` ([`scripts/up.sh`](../scripts/up.sh)), em ordem:

1. confere Node ≥ 22, Docker e `docker compose`;
2. roda `npm ci` na raiz, em `api/` e em `web/` quando o `package-lock.json` mudou desde a última instalação (carimbo em `node_modules/.balcao-lock`);
3. ativa o hook do Git (`git config core.hooksPath .githooks`);
4. para os processos que a subida anterior desta cópia deixou no ar;
5. escolhe as portas: reaproveita as da última subida (`.balcao/portas`) se continuam livres; senão, a primeira livre a partir de 5432 (banco), 4000 (API) e 5173 (front);
6. gera `api/.env` e `web/.env.local` da cópia;
7. sobe o Postgres da cópia (`docker compose -p <projeto>`) e espera o healthcheck; cria o banco `balcao_test`;
8. `prisma generate`, `prisma migrate deploy` (nos dois bancos) e a seed, que é idempotente;
9. inicia API (`tsx watch`), worker e front (Vite) em segundo plano, cada um no próprio grupo de processos;
10. espera `/api/health` e o front responderem e imprime os endereços.

## Como as cópias ficam isoladas

| Recurso | Isolamento |
|---|---|
| Postgres | um container por cópia; projeto compose `balcao-<pasta>-<hash do caminho>`, volume próprio |
| Portas | escolhidas livres na subida e guardadas em `.balcao/portas` |
| Anexos | `.balcao/uploads` dentro da cópia |
| Worker | um por cópia, apontando para o banco da cópia |
| Front → API | `VITE_API_URL` da cópia; a API aceita (CORS) só o front da cópia |
| Processos | PIDs em `.balcao/pids`; `down` encerra os grupos desses PIDs e mais nada |

Tudo o que é de uma cópia fica em `.balcao/` (ignorado pelo Git):

```
.balcao/portas     API_PORT, WEB_PORT e DB_PORT da última subida
.balcao/logs/      api.log, worker.log, web.log, seed.log, prisma.log, compose.log, npm-ci-*.log
.balcao/pids/      api.pid, worker.pid, web.pid
.balcao/uploads/   anexos
```

## Worktrees

```bash
git worktree add ../minha-tarefa
cd ../minha-tarefa
npm run up      # instala dependências, pega portas livres e sobe um banco só seu
```

Ao terminar: `npm run down -- --apagar-dados` dentro da worktree, depois `git worktree remove ../minha-tarefa`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| A subida falhou | A mensagem aponta o log em `.balcao/logs/`. Corrija e rode `npm run up` de novo. |
| Chamado parado em "Em triagem" | Veja `.balcao/logs/worker.log`; `npm run up` reinicia o worker. |
| Mudou `package.json` ou o lock | `npm run up` reinstala sozinho. Não use `npm install` solto ([incidente 1](incidentes.md)). |
| Quero o banco zerado | `npm run down -- --apagar-dados && npm run up` |
| Ver os dados | `cd api && npx prisma studio` (usa o `api/.env` da cópia) |

Não mate processos por porta (`kill -9` em quem está na 4000): a porta pode ser de outra cópia. Use `npm run down` na cópia certa.

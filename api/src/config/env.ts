import { z } from 'zod'

// Único lugar da API que lê process.env (G5). Os valores padrão reproduzem o
// comportamento antigo; o `npm run up` define cada um por cópia do projeto.
const vazioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor)
const texto = (padrao: string) => z.preprocess(vazioComoAusente, z.string().default(padrao))
const numero = (padrao: number) => z.preprocess(vazioComoAusente, z.coerce.number().default(padrao))

const schema = z.object({
  DATABASE_URL: z.preprocess(vazioComoAusente, z.string().optional()),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: numero(4000),
  JWT_SECRET: texto('dev-secret'),
  AI_MODE: texto('fake'),
  OPENAI_API_KEY: z.string().optional(),
  UPLOAD_DIR: texto('/tmp/balcao/uploads'),
  TRIAGE_INTERVAL_MS: numero(2000),
  CORS_ORIGIN: texto('http://localhost:5173'),
})

export const env = schema.parse(process.env)

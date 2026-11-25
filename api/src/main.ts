import { env } from './config/env'
import { createApiServices } from './composition'
import { createApp } from './http/app'

const app = createApp(createApiServices(), { corsOrigin: env.CORS_ORIGIN })

app.listen(env.PORT, () => {
  console.log(`API rodando na porta ${env.PORT}`)
})

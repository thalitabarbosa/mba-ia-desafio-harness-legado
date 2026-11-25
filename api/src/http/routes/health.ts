import { Router } from 'express'
import { HealthService } from '../../services/health-service'

export function healthRoutes(health: HealthService) {
  const router = Router()

  router.get('/', async (_req, res) => {
    if (await health.isDatabaseUp()) {
      res.json({ status: 'ok', db: 'ok' })
    } else {
      res.status(503).json({ error: 'db_unavailable', message: 'Banco de dados não responde' })
    }
  })

  return router
}

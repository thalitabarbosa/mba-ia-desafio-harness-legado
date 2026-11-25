import express from 'express'
import cors from 'cors'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { ticketRoutes } from './routes/tickets'
import { attachmentRoutes } from './routes/attachments'
import { statsRoutes } from './routes/stats'
import { errorHandler, notFoundHandler } from './errors'
import { AuthService } from '../services/auth-service'
import { TicketService } from '../services/ticket-service'
import { AttachmentService } from '../services/attachment-service'
import { SuggestionService } from '../services/suggestion-service'
import { StatsService } from '../services/stats-service'
import { HealthService } from '../services/health-service'

// http/ só conhece serviços; quem monta serviços e repositórios é o composition.ts (G4).
type Services = {
  auth: AuthService
  tickets: TicketService
  attachments: AttachmentService
  suggestions: SuggestionService
  stats: StatsService
  health: HealthService
}

export function createApp(services: Services, options: { corsOrigin: string }) {
  const app = express()

  app.use(cors({ origin: options.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', healthRoutes(services.health))
  app.use('/api/auth', authRoutes(services.auth))
  app.use('/api/tickets', ticketRoutes(services.tickets, services.attachments, services.suggestions))
  app.use('/api/attachments', attachmentRoutes(services.attachments))
  app.use('/api/stats', statsRoutes(services.stats))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

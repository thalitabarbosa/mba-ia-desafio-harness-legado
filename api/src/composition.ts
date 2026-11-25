// Ponto de composição: o único lugar que liga repositórios, integrações e serviços.
// main.ts (API) e jobs/triage-worker.ts (worker) partem daqui.
import { env } from './config/env'
import { attachmentRepository } from './repositories/attachment-repository'
import { healthRepository } from './repositories/health-repository'
import { replyRepository } from './repositories/reply-repository'
import { statsRepository } from './repositories/stats-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { classifyTicket, suggestReply } from './integrations/ai-client'
import { AuthService } from './services/auth-service'
import { TicketService } from './services/ticket-service'
import { AttachmentService } from './services/attachment-service'
import { SuggestionService } from './services/suggestion-service'
import { StatsService } from './services/stats-service'
import { HealthService } from './services/health-service'
import { TriageService } from './services/triage-service'

export function createApiServices() {
  const tickets = new TicketService(ticketRepository, replyRepository)
  return {
    auth: new AuthService(userRepository),
    tickets,
    attachments: new AttachmentService(attachmentRepository, tickets, env.UPLOAD_DIR),
    suggestions: new SuggestionService(tickets, userRepository, suggestReply),
    stats: new StatsService(statsRepository),
    health: new HealthService(healthRepository),
  }
}

export function createTriageService() {
  return new TriageService(ticketRepository, classifyTicket)
}

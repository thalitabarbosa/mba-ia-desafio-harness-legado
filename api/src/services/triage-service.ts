import { Ticket } from '../domain/ticket'
import { TriageQueue } from '../repositories/ticket-repository'
import { Classification } from '../integrations/ai-client'

type Classify = (ticket: Pick<Ticket, 'title' | 'description'>) => Promise<Classification>

const BATCH_SIZE = 10

export class TriageService {
  constructor(
    private queue: TriageQueue,
    private classify: Classify,
  ) {}

  async runOnce() {
    const tickets = await this.queue.findPendingTriage(BATCH_SIZE)
    for (const ticket of tickets) {
      try {
        const result = await this.classify(ticket)
        await this.queue.update(ticket.id, { category: result.category, priority: result.priority, triageStatus: 'done' })
        console.log(`chamado ${ticket.id} triado: ${result.category}/${result.priority}`)
      } catch (err) {
        console.log(`falha na triagem do chamado ${ticket.id}: ${err instanceof Error ? err.message : String(err)}`)
        await this.queue.update(ticket.id, { triageStatus: 'failed' })
      }
    }
  }
}

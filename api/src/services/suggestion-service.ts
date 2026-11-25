import { AppError } from '../domain/errors'
import { CurrentUser, Ticket } from '../domain/ticket'
import { UserRepository } from '../repositories/user-repository'

type TicketAccess = { getById(user: CurrentUser, id: string): Promise<Ticket> }
type SuggestReply = (input: { customerName: string; title: string; description: string }) => Promise<string>

export class SuggestionService {
  constructor(
    private tickets: TicketAccess,
    private users: Pick<UserRepository, 'findById'>,
    private suggestReply: SuggestReply,
  ) {}

  async suggest(user: CurrentUser, ticketId: string) {
    if (user.role === 'customer') {
      throw new AppError(403, 'forbidden', 'Só atendentes e admins podem pedir sugestão')
    }
    const ticket = await this.tickets.getById(user, ticketId)
    const customer = await this.users.findById(ticket.customerId)
    const customerName = customer ? customer.name : 'cliente'
    return this.suggestReply({ customerName, title: ticket.title, description: ticket.description })
  }
}

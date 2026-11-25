import { Reply } from '../domain/ticket'
import { prisma } from './prisma'

type NewReply = { ticketId: string; authorId: string; body: string }

export interface ReplyRepository {
  create(data: NewReply): Promise<Reply>
}

class PrismaReplyRepository implements ReplyRepository {
  create(data: NewReply) {
    return prisma.reply.create({
      data,
      include: { author: { select: { id: true, name: true, role: true } } },
    })
  }
}

export const replyRepository = new PrismaReplyRepository()

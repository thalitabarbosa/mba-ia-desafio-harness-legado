import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Seed idempotente: pode rodar quantas vezes quiser no mesmo banco.
// Usuários por upsert (e-mail único); chamados só são criados se ainda não existem.
const prisma = new PrismaClient()

async function upsertUser(data: { name: string; email: string; password: string; role: 'admin' | 'agent' | 'customer' }) {
  const passwordHash = await bcrypt.hash(data.password, 10)
  return prisma.user.upsert({
    where: { email: data.email },
    update: { name: data.name, passwordHash, role: data.role },
    create: { name: data.name, email: data.email, passwordHash, role: data.role },
  })
}

async function ensureTicket(data: Prisma.TicketUncheckedCreateInput) {
  const existing = await prisma.ticket.findFirst({ where: { title: data.title, customerId: data.customerId } })
  if (!existing) await prisma.ticket.create({ data })
}

async function main() {
  const admin = await upsertUser({ name: 'Admin', email: 'admin@balcao.dev', password: 'Admin@123', role: 'admin' })
  const agent = await upsertUser({ name: 'Ana Atendente', email: 'agente@balcao.dev', password: 'Agente@123', role: 'agent' })
  const customer = await upsertUser({
    name: 'Carlos Cliente',
    email: 'cliente@balcao.dev',
    password: 'Cliente@123',
    role: 'customer',
  })

  await ensureTicket({
    title: 'Não consigo emitir a segunda via do boleto',
    description: 'Quando clico em segunda via aparece uma tela em branco. Preciso pagar até sexta.',
    customerId: customer.id,
  })

  await ensureTicket({
    title: 'Erro ao salvar o perfil',
    description: 'Ao alterar o telefone no perfil aparece a mensagem "erro inesperado".',
    status: 'in_progress',
    category: 'technical',
    priority: 'medium',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [{ authorId: agent.id, body: 'Oi, Carlos! Já estamos olhando o problema.' }],
    },
  })

  await ensureTicket({
    title: 'Dúvida sobre troca de senha',
    description: 'Qual o tamanho mínimo de senha que o sistema aceita?',
    status: 'resolved',
    category: 'account',
    priority: 'low',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [
        { authorId: agent.id, body: 'A senha precisa ter pelo menos 8 caracteres.' },
        { authorId: customer.id, body: 'Obrigado!' },
      ],
    },
  })

  console.log(`seed ok: ${admin.email}, ${agent.email}, ${customer.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

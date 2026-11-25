import { prisma } from './prisma'

export const healthRepository = {
  async ping(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`
  },
}

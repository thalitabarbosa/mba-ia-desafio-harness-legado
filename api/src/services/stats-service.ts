import { CountRow, StatsRepository } from '../repositories/stats-repository'

function fill(base: Record<string, number>, rows: CountRow[]) {
  rows.forEach((row) => {
    base[row.key || 'untriaged'] = row.count
  })
  return base
}

export class StatsService {
  constructor(private stats: StatsRepository) {}

  async summary() {
    const [statusRows, categoryRows, priorityRows] = await Promise.all([
      this.stats.countByStatus(),
      this.stats.countByCategory(),
      this.stats.countByPriority(),
    ])
    return {
      byStatus: fill({ open: 0, in_progress: 0, resolved: 0 }, statusRows),
      byCategory: fill({ billing: 0, technical: 0, account: 0, other: 0, untriaged: 0 }, categoryRows),
      byPriority: fill({ low: 0, medium: 0, high: 0, urgent: 0, untriaged: 0 }, priorityRows),
    }
  }
}

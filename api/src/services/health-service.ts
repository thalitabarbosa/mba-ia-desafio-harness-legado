type DatabasePing = { ping(): Promise<void> }

export class HealthService {
  constructor(private db: DatabasePing) {}

  async isDatabaseUp() {
    try {
      await this.db.ping()
      return true
    } catch (err) {
      console.log('health: banco fora', err)
      return false
    }
  }
}

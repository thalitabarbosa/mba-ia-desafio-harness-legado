// Erro de regra de negócio com o status e o código que a API devolve.
// Fica no domínio para que services/ não dependam de http/ (G6).
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

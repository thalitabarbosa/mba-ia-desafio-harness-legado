import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { AppError } from '../../domain/errors'
import { CurrentUser, Role } from '../../domain/ticket'

export function signToken(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '8h' })
}

// O usuário autenticado fica em res.locals.user (preenchido por requireAuth).
export function currentUser(res: Response): CurrentUser {
  const user = res.locals.user as CurrentUser | undefined
  if (!user) throw new AppError(401, 'unauthorized', 'Token ausente')
  return user
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token ausente' })
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET)
    if (typeof payload === 'string') throw new Error('payload inesperado')
    res.locals.user = { id: payload.sub as string, role: payload.role as Role } satisfies CurrentUser
    next()
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Token inválido' })
  }
}

export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as CurrentUser | undefined
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Sem permissão' })
    }
    next()
  }
}

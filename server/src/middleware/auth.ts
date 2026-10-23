import type { NextFunction, Request, Response } from "express";
import { setAuthCookie, shouldRenew, signToken, verifyToken, type JwtPayload } from "../utils/jwt";
import type { Role } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
    return;
  }
  req.user = payload;
  // Sessão deslizante: enquanto o usuário estiver ativo, o prazo é renovado.
  if (shouldRenew(payload)) {
    setAuthCookie(res, signToken(payload));
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Acesso não permitido" });
      return;
    }
    next();
  };
}

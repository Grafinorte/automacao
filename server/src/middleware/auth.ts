import type { NextFunction, Request, Response } from "express";
import { setAuthCookie, shouldRenew, signToken, verifyToken, type JwtPayload } from "../utils/jwt";
import type { Role } from "../generated/prisma/client";
import { prisma } from "../db/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
  // Sessão deslizante: enquanto o usuário estiver ativo, o prazo é renovado.
  // Na renovação (a cada ~10 min) confere no banco: usuário desativado sai; cargo alterado passa a valer.
  if (shouldRenew(payload)) {
    try {
      const current = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, isActive: true } });
      if (!current || !current.isActive) {
        res.clearCookie("token", { path: "/" });
        res.status(401).json({ error: "Usuário desativado" });
        return;
      }
      payload = { sub: payload.sub, role: current.role };
      setAuthCookie(res, signToken(payload));
    } catch (err) {
      // Banco indisponível: segue com o token atual e tenta renovar na próxima requisição
      console.error("[auth] Falha ao renovar a sessão:", err);
    }
  }
  req.user = payload;
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

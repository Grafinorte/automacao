import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  // Tabela/coluna que ainda não existe no banco: atualização aplicada sem o "npx prisma db push"
  const code = (err as { code?: string })?.code;
  if (code === "P2021" || code === "P2022") {
    res.status(500).json({ error: "O banco de dados está desatualizado para esta função. Peça ao T.I. para rodar \"npx prisma db push\" na pasta server e reiniciar a plataforma." });
    return;
  }
  res.status(500).json({ error: "Erro interno do servidor" });
}

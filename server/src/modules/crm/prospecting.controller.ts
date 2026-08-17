import type { Request, Response } from "express";
import * as prospectingService from "./prospecting.service";
import { HttpError } from "../../middleware/errorHandler";

function validateInput(body: Record<string, unknown>): { error: string; status: number } | { input: { segmento: string; regiao: string; quantidade: number; observacoes?: string } } {
  const { segmento, regiao, quantidade, observacoes } = body;
  if (!segmento || typeof segmento !== "string" || !segmento.trim()) {
    return { error: "Segmento é obrigatório", status: 400 };
  }
  if (!regiao || typeof regiao !== "string" || !regiao.trim()) {
    return { error: "Região é obrigatória", status: 400 };
  }
  const parsedQuantidade = Number(quantidade);
  if (!Number.isInteger(parsedQuantidade) || parsedQuantidade < 1 || parsedQuantidade > 15) {
    return { error: "Quantidade deve ser um número entre 1 e 15", status: 400 };
  }
  return {
    input: {
      segmento: (segmento as string).trim(),
      regiao: (regiao as string).trim(),
      quantidade: parsedQuantidade,
      observacoes: typeof observacoes === "string" ? observacoes : undefined,
    },
  };
}

export async function postProspecting(req: Request, res: Response) {
  const validated = validateInput(req.body ?? {});
  if ("error" in validated) {
    res.status(validated.status).json({ error: validated.error });
    return;
  }
  const result = await prospectingService.runProspecting(validated.input);
  res.json(result);
}

export async function postProspectingStream(req: Request, res: Response) {
  const validated = validateInput(req.body ?? {});
  if ("error" in validated) {
    res.status(validated.status).json({ error: validated.error });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const raw = await prospectingService.streamProspecting(validated.input, (company) => {
      send({ type: "company", company });
    });
    send({ type: "done", raw });
  } catch (err: unknown) {
    const msg = err instanceof HttpError ? err.message : "Erro interno no servidor";
    send({ type: "error", message: msg });
  } finally {
    res.end();
  }
}

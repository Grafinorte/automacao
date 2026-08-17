import type { Request, Response } from "express";
import { runCrmAgent, type ChatMessage } from "./crm-agent.service";
import { HttpError } from "../../middleware/errorHandler";

export async function postCrmAgent(req: Request, res: Response) {
  const { message, history } = req.body ?? {};

  if (!message || typeof message !== "string" || !message.trim()) {
    throw new HttpError(400, "Mensagem é obrigatória");
  }

  const safeHistory: ChatMessage[] = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.role === "string" && typeof m.text === "string")
        .slice(-20) // keep last 20 turns to avoid huge context
    : [];

  const reply = await runCrmAgent(message.trim(), safeHistory);
  res.json({ reply });
}

import type { Request, Response } from "express";
import * as assistantService from "./assistant.service";

export async function postChat(req: Request, res: Response) {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages é obrigatório e deve ser uma lista não vazia" });
    return;
  }
  const valid = messages.every(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0
  );
  if (!valid) {
    res.status(400).json({ error: "Cada mensagem precisa de role (user/assistant) e content" });
    return;
  }

  const reply = await assistantService.chat(messages);
  res.json({ role: "assistant", content: reply });
}

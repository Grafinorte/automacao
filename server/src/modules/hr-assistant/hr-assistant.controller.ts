import type { Request, Response } from "express";
import * as svc from "./hr-assistant.service";

export async function postAsk(req: Request, res: Response) {
  const { question, history } = req.body ?? {};
  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "question é obrigatório" }); return;
  }
  const safeHistory = Array.isArray(history) ? history : [];
  const answer = await svc.askHr(question.trim(), safeHistory);
  res.json({ answer });
}

export async function getConversations(req: Request, res: Response) {
  const list = await svc.listConversations(req.user!.sub);
  res.json(list);
}

export async function putConversation(req: Request, res: Response) {
  const { id } = req.params;
  const { title, messages } = req.body ?? {};
  if (!title || !Array.isArray(messages)) {
    res.status(400).json({ error: "title e messages são obrigatórios" }); return;
  }
  const conv = await svc.saveConversation(req.user!.sub, id ?? null, title, messages);
  res.json(conv);
}

export async function getConversation(req: Request, res: Response) {
  const conv = await svc.getConversation(req.params.id, req.user!.sub);
  if (!conv) { res.status(404).json({ error: "Conversa não encontrada" }); return; }
  res.json(conv);
}

export async function deleteConversation(req: Request, res: Response) {
  await svc.deleteConversation(req.params.id, req.user!.sub);
  res.status(204).send();
}

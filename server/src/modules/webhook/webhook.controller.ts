import type { Request, Response } from "express";
import * as svc from "./webhook.service";

export async function postLead(req: Request, res: Response) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const key = req.headers["x-api-key"];
    if (key !== secret) {
      res.status(401).json({ error: "Chave de API inválida" });
      return;
    }
  }

  const { name, email, phone, message, source } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Campo 'name' obrigatório" });
    return;
  }

  const result = await svc.ingestLead({ name, email, phone, message, source });
  res.status(201).json({ ok: true, contactId: result.contact.id, dealId: result.deal?.id ?? null });
}

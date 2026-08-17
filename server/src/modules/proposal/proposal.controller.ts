import type { Request, Response } from "express";
import * as proposalService from "./proposal.service";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function postExtract(req: Request, res: Response) {
  const { fileBase64, mimeType } = req.body ?? {};

  if (!fileBase64 || !mimeType) {
    res.status(400).json({ error: "Arquivo obrigatório." });
    return;
  }
  if (!ALLOWED_TYPES.includes(mimeType)) {
    res.status(400).json({ error: "Formato não suportado. Use PDF, JPEG, PNG ou WEBP." });
    return;
  }

  const data = await proposalService.extractFromDocument(fileBase64, mimeType);
  res.json(data);
}

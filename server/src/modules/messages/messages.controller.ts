import type { Request, Response } from "express";
import * as messagesService from "./messages.service";

export async function getConversations(req: Request, res: Response) {
  res.json(await messagesService.listConversations(req.user!.sub));
}

export async function getThread(req: Request, res: Response) {
  res.json(await messagesService.getThread(req.user!.sub, req.params.userId));
}

export async function postMessage(req: Request, res: Response) {
  const { recipientId, body, attachments } = req.body ?? {};
  const hasBody = typeof body === "string" && body.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!recipientId || (!hasBody && !hasAttachments)) {
    res.status(400).json({ error: "Destinatário e mensagem/arquivo são obrigatórios" });
    return;
  }
  const message = await messagesService.sendMessage(
    req.user!.sub,
    recipientId,
    hasBody ? body.trim() : "",
    hasAttachments ? attachments : undefined
  );
  res.status(201).json(message);
}

export async function postUploadMessageFile(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Arquivo é obrigatório" });
    return;
  }
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const result = messagesService.uploadMessageFile(req.user!.sub, dataUrl, file.originalname);
  res.json(result);
}

export async function patchThreadRead(req: Request, res: Response) {
  await messagesService.markThreadRead(req.user!.sub, req.params.userId);
  res.status(204).send();
}

export async function getUnreadCount(req: Request, res: Response) {
  res.json({ count: await messagesService.countUnread(req.user!.sub) });
}

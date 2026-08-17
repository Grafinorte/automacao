import type { Request, Response } from "express";
import * as svc from "./group-chat.service";

export async function getGroups(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const groups = await svc.listGroupChats(userId);
  res.json(groups);
}

export async function postGroup(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const { name, memberIds = [] } = req.body as { name: string; memberIds: string[] };
  if (!name?.trim()) { res.status(400).json({ error: "Nome obrigatório" }); return; }
  const group = await svc.createGroupChat(name.trim(), userId, memberIds);
  res.status(201).json(group);
}

export async function getGroup(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const group = await svc.getGroupChat(req.params.id, userId);
  if (!group) { res.status(404).json({ error: "Grupo não encontrado" }); return; }
  res.json(group);
}

export async function deleteGroup(req: Request, res: Response) {
  await svc.deleteGroupChat(req.params.id);
  res.status(204).end();
}

export async function postMember(req: Request, res: Response) {
  const { userId } = req.body as { userId: string };
  const group = await svc.addGroupMember(req.params.id, userId);
  res.json(group);
}

export async function deleteMember(req: Request, res: Response) {
  const group = await svc.removeGroupMember(req.params.id, req.params.userId);
  res.json(group);
}

export async function getMessages(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const msgs = await svc.getGroupMessages(req.params.id, userId);
  if (!msgs) { res.status(403).json({ error: "Sem acesso" }); return; }
  res.json(msgs);
}

export async function postMessage(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const { body, attachments } = req.body as { body?: string; attachments?: { fileUrl: string; fileName: string }[] };
  const hasBody = typeof body === "string" && body.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!hasBody && !hasAttachments) { res.status(400).json({ error: "Mensagem ou arquivo obrigatório" }); return; }
  const msg = await svc.sendGroupMessage(req.params.id, userId, hasBody ? body!.trim() : "", hasAttachments ? attachments : undefined);
  res.status(201).json(msg);
}

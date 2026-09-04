import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import * as svc from "./services.service";

const WRITE_ROLES = ["ADMIN", "GERENTE", "SUPERVISOR", "ORCAMENTISTA", "COMERCIAL", "MEMBER"];
const WORKFLOW_ROLES = ["ADMIN", "DESIGN", "ARTE", "ARTE_FINAL"];
const QUEUE_ROLES = ["ADMIN", "PCP"];
const DELETE_ROLES = ["ADMIN", "PCP", "GERENTE", "SUPERVISOR"];

async function actorName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? "Desconhecido";
}

export async function getServices(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json(await svc.listServices(status));
}

export async function getLogs(req: Request, res: Response) {
  res.json(await svc.listLogs());
}

export async function postService(req: Request, res: Response) {
  const role = req.user!.role;
  if (!WRITE_ROLES.includes(role)) {
    res.status(403).json({ error: "Sem permissão para criar serviços" });
    return;
  }

  const { name, type, orderDate, seller, requester, clientPhone, items } = req.body ?? {};
  if (!name || !type || !orderDate) {
    res.status(400).json({ error: "name, type e orderDate são obrigatórios" });
    return;
  }

  const userId = req.user!.sub;
  const name_ = await actorName(userId);

  const service = await svc.createService({
    name,
    type,
    orderDate,
    seller: seller ?? "",
    requester: requester ?? "",
    clientPhone: clientPhone ?? "",
    items: Array.isArray(items) ? items : [],
    actorId: userId,
    actorName: name_,
  });

  res.status(201).json(service);
}

export async function putService(req: Request, res: Response) {
  const role = req.user!.role;
  const userId = req.user!.sub;

  const existing = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Serviço não encontrado" }); return; }

  const canEdit = WRITE_ROLES.includes(role) || existing.createdByUserId === userId;
  if (!canEdit) { res.status(403).json({ error: "Sem permissão para editar" }); return; }

  const { name, type, orderDate, seller, requester, clientPhone, items } = req.body ?? {};
  const aName = await actorName(userId);

  const result = await svc.updateService(req.params.id, {
    name, type, orderDate, seller, requester, clientPhone, items,
    actorId: userId, actorName: aName,
  });

  res.json(result);
}

export async function putStatus(req: Request, res: Response) {
  const role = req.user!.role;
  const userId = req.user!.sub;
  const { newStatus, developerUserId, completionMessage, itemCompletions, deletedReason } = req.body ?? {};

  if (!newStatus) { res.status(400).json({ error: "newStatus obrigatório" }); return; }

  const existing = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Serviço não encontrado" }); return; }

  if ((newStatus === "development" || newStatus === "done") && !WORKFLOW_ROLES.includes(role)) {
    res.status(403).json({ error: "Sem permissão para este status" }); return;
  }
  if (newStatus === "deleted") {
    const canDelete = DELETE_ROLES.includes(role) || existing.createdByUserId === userId;
    if (!canDelete) { res.status(403).json({ error: "Sem permissão para excluir" }); return; }
  }
  if (newStatus === "open" && !WRITE_ROLES.includes(role)) {
    res.status(403).json({ error: "Sem permissão para reabrir" }); return;
  }

  const aName = await actorName(userId);

  const result = await svc.changeStatus(req.params.id, {
    newStatus,
    developerUserId,
    completionMessage,
    itemCompletions,
    deletedReason,
    actorId: userId,
    actorName: aName,
  });

  res.json(result);
}

export async function putQueue(req: Request, res: Response) {
  const role = req.user!.role;
  if (!QUEUE_ROLES.includes(role)) {
    res.status(403).json({ error: "Sem permissão para reordenar fila" }); return;
  }

  const { orderedIds } = req.body ?? {};
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds (array) obrigatório" }); return;
  }

  const userId = req.user!.sub;
  const aName = await actorName(userId);
  await svc.reorderQueue(orderedIds, userId, aName);
  res.status(204).send();
}

export async function postAttachment(req: Request, res: Response) {
  const { itemId, fileName, dataUrl, type } = req.body ?? {};
  if (!fileName || !dataUrl) {
    res.status(400).json({ error: "fileName e dataUrl são obrigatórios" }); return;
  }

  const userId = req.user!.sub;
  const aName = await actorName(userId);

  const result = await svc.uploadAttachment({
    serviceId: req.params.id,
    itemId,
    fileName,
    dataUrl,
    type: type ?? "service",
    actorId: userId,
    actorName: aName,
  });

  res.json(result);
}

export async function deleteAttachment(req: Request, res: Response) {
  const { itemId, attachmentUrl, type } = req.body ?? {};
  if (!itemId || !attachmentUrl) {
    res.status(400).json({ error: "itemId e attachmentUrl são obrigatórios" }); return;
  }

  const userId = req.user!.sub;
  const aName = await actorName(userId);

  await svc.deleteAttachment(req.params.id, itemId, attachmentUrl, type ?? "service", userId, aName);
  res.status(204).send();
}

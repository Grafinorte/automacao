import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { currentPeriod, isPeriod, previousPeriod } from "./pcpStock.period";
import { readOsPdf } from "./pcpStock.os";
import { invoicePdfPath } from "./pcpStock.files";
import { sendReport } from "./pcpStock.report";
import * as service from "./pcpStock.service";

const MODULE_ID = "estoquepcp";

/** Mesma regra da tela: permissões personalizadas têm prioridade sobre o padrão do cargo */
export function canAccessStock(user: { role: string; permissions: string | null } | null) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.permissions === null) return user.role === "PCP";
  try { return (JSON.parse(user.permissions) as string[]).includes(MODULE_ID); } catch { return false; }
}

export async function requireStockAccess(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { role: true, permissions: true } });
  if (!canAccessStock(user)) { res.status(403).json({ error: "Acesso não permitido" }); return; }
  next();
}

/** Só lê o PDF e devolve os campos; nada é gravado */
export async function postReadOs(req: Request, res: Response) {
  res.json(await readOsPdf(req.body?.pdf));
}

export async function getItems(_req: Request, res: Response) {
  res.json(await service.listItems());
}

export async function postItem(req: Request, res: Response) {
  res.status(201).json(await service.createItem(req.body ?? {}, req.user!.sub));
}

export async function patchItem(req: Request, res: Response) {
  res.json(await service.updateItem(req.params.id, req.body ?? {}));
}

export async function deleteItem(req: Request, res: Response) {
  res.json({ result: await service.removeItem(req.params.id) });
}

export async function postMovement(req: Request, res: Response) {
  res.status(201).json(await service.addMovement(req.params.id, req.user!.sub, req.body ?? {}));
}

export async function getHistory(req: Request, res: Response) {
  res.json(await service.getItemHistory(req.params.id));
}

export async function postStage(req: Request, res: Response) {
  res.json(await service.moveStage(req.params.id, req.user!.sub, req.body?.to));
}

export async function postReceive(req: Request, res: Response) {
  res.json(await service.receiveItem(req.params.id, req.user!.sub, req.body ?? {}));
}

export async function postInvoice(req: Request, res: Response) {
  res.status(201).json(await service.invoiceItems(req.user!.sub, req.body ?? {}));
}

export async function postInvoiceFile(req: Request, res: Response) {
  res.json(await service.attachInvoice(req.params.id, req.body ?? {}));
}

/** Abre o PDF da nota no navegador */
export async function getInvoiceFile(req: Request, res: Response) {
  const file = await service.getInvoiceFile(req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.sendFile(invoicePdfPath(file.stored));
}

export async function getDispatch(_req: Request, res: Response) {
  res.json(await service.listDispatch());
}

export async function postDispatch(req: Request, res: Response) {
  res.json(await service.dispatchMovement(req.params.id, req.user!.sub, req.body ?? {}));
}

export async function getMovements(req: Request, res: Response) {
  const period = isPeriod(req.query.month) ? req.query.month : currentPeriod(new Date());
  res.json(await service.listMovements(period));
}

export async function getSettings(req: Request, res: Response) {
  const settings = await service.getSettings();
  res.json({
    recipients: settings.recipients,
    senderUserId: settings.senderUserId,
    lastPeriodSent: settings.lastPeriodSent,
    lastSentAt: settings.lastSentAt,
    lastError: settings.lastError,
    // Só o admin escolhe o remetente
    senders: req.user!.role === "ADMIN" ? await service.listSenders() : [],
  });
}

export async function putSettings(req: Request, res: Response) {
  await service.updateSettings(req.body ?? {});
  await getSettings(req, res);
}

export async function postSendReport(req: Request, res: Response) {
  const period = req.body?.month ?? previousPeriod(new Date());
  if (!isPeriod(period)) throw new HttpError(400, "Mês inválido.");
  await sendReport(period);
  await getSettings(req, res);
}

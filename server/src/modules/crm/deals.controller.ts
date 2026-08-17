import type { Request, Response } from "express";
import * as dealsService from "./deals.service";
import { prisma } from "../../db/prisma";

export async function getBoard(req: Request, res: Response) {
  const isAdmin = req.user!.role === "ADMIN";

  let ownerId: string | undefined;
  if (!isAdmin) {
    // Non-admin always sees only their own deals, regardless of query param
    ownerId = req.user!.sub;
  } else {
    const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;
    if (!owner || owner === "all") {
      ownerId = undefined;
    } else if (owner === "me") {
      ownerId = req.user!.sub;
    } else {
      ownerId = owner;
    }
  }

  res.json(await dealsService.listBoard(ownerId));
}

export async function getDealById(req: Request, res: Response) {
  res.json(await dealsService.getDeal(req.params.id));
}

export async function postDeal(req: Request, res: Response) {
  const { title, contactId, stageId, value, expectedCloseDate, notes, ownerId, nextFollowUp, lossReason, company } = req.body ?? {};
  if (!title || !stageId) {
    res.status(400).json({ error: "title e stageId são obrigatórios" });
    return;
  }
  let resolvedContactId = contactId;
  if (!resolvedContactId) {
    const contact = await prisma.contact.create({ data: { name: title } });
    resolvedContactId = contact.id;
  }
  const deal = await dealsService.createDeal({
    title,
    contactId: resolvedContactId,
    stageId,
    value,
    expectedCloseDate,
    notes,
    nextFollowUp,
    lossReason,
    company,
    ownerId: ownerId || req.user!.sub,
    createdById: req.user!.sub,
  });
  res.status(201).json(deal);
}

export async function patchDeal(req: Request, res: Response) {
  const { title, contactId, value, expectedCloseDate, notes, ownerId, quoteId, nextFollowUp, lossReason, company } = req.body ?? {};
  const deal = await dealsService.updateDeal(req.params.id, {
    title, contactId, value, expectedCloseDate, notes, ownerId, quoteId, nextFollowUp, lossReason, company,
  });
  res.json(deal);
}

export async function deleteDeal(req: Request, res: Response) {
  await dealsService.deleteDeal(req.params.id);
  res.status(204).send();
}

export async function getDealsExport(req: Request, res: Response) {
  const isAdmin = req.user!.role === "ADMIN";
  const queryOwner = typeof req.query.owner === "string" ? req.query.owner : undefined;

  // Non-admin: always restricted to own leads
  // Admin: respects ?owner param (omit or "all" = everyone)
  let ownerId: string | undefined;
  if (!isAdmin) {
    ownerId = req.user!.sub;
  } else if (!queryOwner || queryOwner === "all") {
    ownerId = undefined;
  } else {
    ownerId = queryOwner;
  }

  const deals = await dealsService.listDealsForExport(ownerId);

  const esc = (s: string | null | undefined) =>
    `"${String(s ?? "").replace(/"/g, '""')}"`;
  const fmtDate = (v: Date | null | undefined) =>
    v ? new Date(v).toLocaleDateString("pt-BR") : "";
  const fmtMoney = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const header =
    "Negócio;Etapa;Contato;Empresa do Contato;E-mail;Telefone;Empresa;Responsável;Valor (R$);Prev. Fechamento;Próx. Follow-up;Motivo Perda;Criado em";

  const rows = deals.map((d) =>
    [
      esc(d.title),
      esc(d.stage.name),
      esc(d.contact.name),
      esc(d.contact.company),
      esc(d.contact.email),
      esc(d.contact.phone),
      esc(d.company),
      esc(d.owner.name),
      fmtMoney(d.value),
      fmtDate(d.expectedCloseDate),
      fmtDate(d.nextFollowUp),
      esc(d.lossReason),
      fmtDate(d.createdAt),
    ].join(";")
  );

  const csv = "﻿" + [header, ...rows].join("\r\n");
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads-crm-${today}.csv"`);
  res.send(csv);
}

export async function moveDeal(req: Request, res: Response) {
  const { toStageId, toIndex } = req.body ?? {};
  if (!toStageId || typeof toIndex !== "number") {
    res.status(400).json({ error: "toStageId e toIndex são obrigatórios" });
    return;
  }
  await dealsService.moveDeal(req.params.id, toStageId, toIndex);
  res.status(204).send();
}

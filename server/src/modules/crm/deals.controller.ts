import type { Request, Response } from "express";
import * as dealsService from "./deals.service";
import { prisma } from "../../db/prisma";
import { LEAD_SOURCE_LABELS, parseLeadSource, type LeadSource } from "./lead-sources";

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
  const { title, contactId, stageId, value, expectedCloseDate, notes, ownerId, nextFollowUp, lossReason, company, sourceDetail } = req.body ?? {};
  const source = parseLeadSource(req.body?.source);
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
    source,
    sourceDetail,
    ownerId: ownerId || req.user!.sub,
    createdById: req.user!.sub,
  });
  res.status(201).json(deal);
}

export async function patchDeal(req: Request, res: Response) {
  const { title, contactId, value, expectedCloseDate, notes, ownerId, quoteId, nextFollowUp, lossReason, company, sourceDetail } = req.body ?? {};
  const source = parseLeadSource(req.body?.source);
  const deal = await dealsService.updateDeal(req.params.id, {
    title, contactId, value, expectedCloseDate, notes, ownerId, quoteId, nextFollowUp, lossReason, company, source, sourceDetail,
  });
  res.json(deal);
}

export async function deleteDeal(req: Request, res: Response) {
  await dealsService.deleteDeal(req.params.id);
  res.status(204).send();
}

// Exclusivo do ADMIN (ver crm.routes.ts). ?owner filtra por responsável (omitir ou "all" = todos)
export async function getDealsExport(req: Request, res: Response) {
  const queryOwner = typeof req.query.owner === "string" ? req.query.owner : undefined;
  let ownerId: string | undefined;
  if (!queryOwner || queryOwner === "all") {
    ownerId = undefined;
  } else if (queryOwner === "me") {
    ownerId = req.user!.sub;
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

  const fmtSource = (s: string | null) =>
    s && s in LEAD_SOURCE_LABELS ? LEAD_SOURCE_LABELS[s as LeadSource] : "Não informado";
  const fmtStatus = (st: { isClosed: boolean; isWon: boolean }) =>
    st.isWon ? "Ganho" : st.isClosed ? "Perdido" : "Em aberto";

  const header = [
    "Negócio", "Status", "Etapa", "Origem do lead", "Detalhe da origem",
    "Contato", "Empresa do contato", "E-mail", "Telefone", "Empresa (Grafinorte/Pluspack)",
    "Responsável", "Criado por", "Valor (R$)", "Nº Orçamento", "Prev. fechamento", "Próx. contato",
    "Motivo da perda", "Qtd. anotações", "Última anotação", "Data da última anotação", "Notas",
    "Criado em", "Atualizado em",
  ].join(";");

  const rows = deals.map((d) =>
    [
      esc(d.title),
      esc(fmtStatus(d.stage)),
      esc(d.stage.name),
      esc(fmtSource(d.source)),
      esc(d.sourceDetail),
      esc(d.contact.name),
      esc(d.contact.company),
      esc(d.contact.email),
      esc(d.contact.phone),
      esc(d.company),
      esc(d.owner.name),
      esc(d.createdBy.name),
      fmtMoney(d.value),
      d.quote ? String(d.quote.number) : "",
      fmtDate(d.expectedCloseDate),
      fmtDate(d.nextFollowUp),
      esc(d.lossReason),
      String(d._count.activities),
      esc(d.activities[0]?.body),
      fmtDate(d.activities[0]?.createdAt),
      esc(d.notes),
      fmtDate(d.createdAt),
      fmtDate(d.updatedAt),
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

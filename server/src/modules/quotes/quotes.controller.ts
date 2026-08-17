import type { Request, Response } from "express";
import * as quotesService from "./quotes.service";
import { streamQuotePdf, generateQuotePdfBuffer } from "./quote-pdf";
import { sendQuoteEmail } from "../email/email.service";
import { prisma } from "../../db/prisma";

export async function getQuotes(_req: Request, res: Response) {
  res.json(await quotesService.listQuotes());
}

export async function getQuoteById(req: Request, res: Response) {
  res.json(await quotesService.getQuote(req.params.id));
}

export async function postQuote(req: Request, res: Response) {
  const { issuingCompany, clientName, clientContact, validUntil, notes, items } = req.body ?? {};
  if (!issuingCompany || !clientName || !Array.isArray(items)) {
    res.status(400).json({ error: "Empresa, cliente e itens são obrigatórios" });
    return;
  }
  const quote = await quotesService.createQuote({
    issuingCompany,
    clientName,
    clientContact,
    validUntil,
    notes,
    items,
    createdById: req.user!.sub,
  });
  res.status(201).json(quote);
}

export async function deleteQuote(req: Request, res: Response) {
  await quotesService.deleteQuote(req.params.id);
  res.status(204).send();
}

export async function getQuotePdf(req: Request, res: Response) {
  const quote = await quotesService.getQuote(req.params.id);
  streamQuotePdf(quote, res);
}

export async function postSendEmail(req: Request, res: Response) {
  const { to } = req.body as { to: string };
  if (!to || !to.includes("@")) {
    res.status(400).json({ error: "E-mail do destinatário inválido." });
    return;
  }

  const [quote, sender] = await Promise.all([
    quotesService.getQuote(req.params.id),
    prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      select: { name: true, smtpEmail: true, smtpAppPassword: true },
    }),
  ]);

  if (!sender.smtpEmail || !sender.smtpAppPassword) {
    res.status(400).json({ error: "Configure seu e-mail e senha de app no Perfil antes de enviar." });
    return;
  }

  const pdfBuffer = await generateQuotePdfBuffer(quote);

  await sendQuoteEmail({
    smtpEmail: sender.smtpEmail,
    smtpAppPassword: sender.smtpAppPassword,
    to,
    quote,
    pdfBuffer,
  });

  res.json({ ok: true });
}

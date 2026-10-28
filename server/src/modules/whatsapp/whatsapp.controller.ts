import type { Request, Response } from "express";
import { env } from "../../config/env";
import * as waService from "./whatsapp.service";

// ─── Webhook ──────────────────────────────────────────────────────────────────

export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsappVerifyToken) {
    console.log("[WhatsApp] Webhook verificado com sucesso.");
    res.status(200).send(challenge);
  } else {
    console.warn("[WhatsApp] Falha na verificação do webhook.");
    res.sendStatus(403);
  }
}

export async function receiveWebhook(req: Request, res: Response) {
  res.sendStatus(200);

  // Handle delivery/read status updates
  for (const statusUpdate of waService.parseStatusUpdates(req.body)) {
    await waService.handleStatusUpdate(statusUpdate).catch((err) =>
      console.error("[WhatsApp] Erro ao atualizar status:", err)
    );
  }

  // Handle incoming messages — o mesmo aviso pode trazer várias mensagens
  for (const msg of waService.parseIncomingMessages(req.body)) {
    console.log("[WhatsApp] parsed msg id=%s type=%s from=%s text=%s", msg.messageId, msg.mediaType ?? "text", msg.from, msg.text?.slice(0, 80));
    try {
      await waService.handleIncomingMessage(msg);
    } catch (err) {
      console.error("[WhatsApp] Erro ao processar mensagem:", err);
    }
  }
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function startConversation(req: Request, res: Response) {
  const { phone, name, text, phoneNumberId } = req.body as { phone?: string; name?: string; text?: string; phoneNumberId?: string };
  if (!phone || !text?.trim()) {
    res.status(400).json({ error: "Número e mensagem são obrigatórios." });
    return;
  }
  const result = await waService.startConversation(phone, name ?? phone, text, req.user!.sub, phoneNumberId);
  res.status(201).json(result);
}

export async function getConversations(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  // Non-admin users only see conversations for their assigned phone number
  let filterPhoneNumberId: string | undefined;
  if (req.user!.role !== "ADMIN") {
    const dbUser = await import("../../db/prisma").then(m =>
      m.prisma.user.findUnique({ where: { id: req.user!.sub }, select: { waPhoneNumberId: true } })
    );
    if (dbUser?.waPhoneNumberId) filterPhoneNumberId = dbUser.waPhoneNumberId;
  }
  res.json(await waService.listConversations(status, filterPhoneNumberId));
}

export async function postReadAll(req: Request, res: Response) {
  const requested = typeof req.body?.phoneNumberId === "string" && req.body.phoneNumberId !== "all" ? req.body.phoneNumberId : undefined;
  let phoneNumberId = requested;
  // Quem não é admin só marca as conversas do próprio número (mesma regra da lista)
  if (req.user!.role !== "ADMIN") {
    const dbUser = await import("../../db/prisma").then(m =>
      m.prisma.user.findUnique({ where: { id: req.user!.sub }, select: { waPhoneNumberId: true } })
    );
    if (dbUser?.waPhoneNumberId) phoneNumberId = dbUser.waPhoneNumberId;
  }
  const count = await waService.markAllConversationsRead(phoneNumberId);
  res.json({ count });
}

export async function getConversationMessages(req: Request, res: Response) {
  const { id } = req.params;
  const [conversation, messages] = await Promise.all([
    waService.getConversation(id),
    waService.getMessages(id),
  ]);
  await waService.markConversationRead(id);
  res.json({ conversation, messages });
}

/** Vendedor está digitando: mostra "digitando…" no celular do cliente */
export async function postTyping(req: Request, res: Response) {
  res.json({ ok: true });
  waService.sendTypingIndicator(req.params.id).catch((err) =>
    console.warn("[WhatsApp] Aviso de digitação não enviado:", (err as Error)?.message ?? err)
  );
}

export async function postMessage(req: Request, res: Response) {
  const { id } = req.params;
  const { text, replyToId, isInternal, forwarded } = req.body as { text?: string; replyToId?: string; isInternal?: boolean; forwarded?: boolean };
  if (!text?.trim()) {
    res.status(400).json({ error: "Texto é obrigatório." });
    return;
  }
  const message = await waService.sendConversationMessage(id, text, req.user!.sub, replyToId, isInternal, forwarded);
  res.json(message);
}

export async function deleteMessage(req: Request, res: Response) {
  await waService.deleteMessage(req.params.messageId);
  res.json({ ok: true });
}

export async function patchMessage(req: Request, res: Response) {
  const { messageId } = req.params;
  const { text } = req.body ?? {};
  if (!text?.trim()) {
    res.status(400).json({ error: "Texto é obrigatório." });
    return;
  }
  const msg = await waService.editMessageText(messageId, text.trim());
  res.json(msg);
}

export async function starMessage(req: Request, res: Response) {
  const { messageId } = req.params;
  const { starred } = req.body ?? {};
  const msg = await waService.starMessage(messageId, starred === true);
  res.json(msg);
}

export async function getLinkPreview(req: Request, res: Response) {
  const url = typeof req.query.url === "string" ? req.query.url : null;
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  const preview = await waService.getLinkPreview(url);
  res.json(preview ?? {});
}

export async function patchConversation(req: Request, res: Response) {
  const { id } = req.params;
  const { status, assignedToId, pinned } = req.body as { status?: string; assignedToId?: string | null; pinned?: boolean };

  if (status === "closed") await waService.closeConversation(id);
  else if (status === "open") await waService.reopenConversation(id);

  if (assignedToId !== undefined) await waService.assignConversation(id, assignedToId);
  if (pinned !== undefined) await waService.togglePin(id, pinned);

  res.json(await waService.getConversation(id));
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function getContacts(_req: Request, res: Response) {
  res.json(await waService.listContacts());
}

export async function patchContact(req: Request, res: Response) {
  const { id } = req.params;
  const { name, notes, crmContactId } = req.body as {
    name?: string;
    notes?: string;
    crmContactId?: string | null;
  };
  res.json(await waService.updateContact(id, { name, notes, crmContactId }));
}

// ─── Automations ──────────────────────────────────────────────────────────────

/** Número de WhatsApp atribuído ao usuário (null se não tiver) */
async function assignedPhoneOf(userId: string): Promise<string | null> {
  const { prisma } = await import("../../db/prisma");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { waPhoneNumberId: true } });
  return u?.waPhoneNumberId ?? null;
}

/**
 * Admin gerencia todas as automações (gerais e de qualquer número).
 * Quem tem número atribuído gerencia só as do próprio número; as gerais ficam só para leitura.
 */
async function canManageAutomation(req: Request, automationPhone: string | null): Promise<boolean> {
  if (req.user!.role === "ADMIN") return true;
  const mine = await assignedPhoneOf(req.user!.sub);
  return !!mine && automationPhone === mine;
}

export async function getAutomations(req: Request, res: Response) {
  if (req.user!.role === "ADMIN") {
    res.json(await waService.listAutomations());
    return;
  }
  const mine = await assignedPhoneOf(req.user!.sub);
  res.json(await waService.listAutomations(mine ?? undefined));
}

export async function postAutomation(req: Request, res: Response) {
  const { name, keyword, matchType, response, active, phoneNumberId } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    response?: string;
    active?: boolean;
    phoneNumberId?: string | null;
  };
  if (!name || !keyword || !response) {
    res.status(400).json({ error: "Nome, keyword e resposta são obrigatórios." });
    return;
  }
  // "all" é o filtro "todos os números" da tela — vira automação geral
  let targetPhone: string | null = phoneNumberId && phoneNumberId !== "all" ? phoneNumberId : null;
  if (req.user!.role !== "ADMIN") {
    const mine = await assignedPhoneOf(req.user!.sub);
    if (!mine) {
      res.status(403).json({ error: "Você precisa ter um número de WhatsApp atribuído para criar automações." });
      return;
    }
    targetPhone = mine; // não-admin sempre cria para o próprio número
  }
  res.status(201).json(await waService.createAutomation({ name, keyword, matchType, response, active, phoneNumberId: targetPhone }));
}

export async function patchAutomation(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await waService.getAutomation(id);
  if (!existing) { res.status(404).json({ error: "Automação não encontrada." }); return; }
  if (!(await canManageAutomation(req, existing.phoneNumberId))) {
    res.status(403).json({ error: "Você só pode alterar automações do seu número." });
    return;
  }
  const { name, keyword, matchType, response, active, phoneNumberId } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    response?: string;
    active?: boolean;
    phoneNumberId?: string | null;
  };
  // Só o admin troca o número de uma automação
  const phonePatch = req.user!.role === "ADMIN" && phoneNumberId !== undefined ? { phoneNumberId: phoneNumberId && phoneNumberId !== "all" ? phoneNumberId : null } : {};
  res.json(await waService.updateAutomation(id, { name, keyword, matchType, response, active, ...phonePatch }));
}

export async function deleteAutomation(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await waService.getAutomation(id);
  if (!existing) { res.status(404).json({ error: "Automação não encontrada." }); return; }
  if (!(await canManageAutomation(req, existing.phoneNumberId))) {
    res.status(403).json({ error: "Você só pode excluir automações do seu número." });
    return;
  }
  await waService.deleteAutomation(id);
  res.json({ ok: true });
}

// ─── Meta Message Templates ───────────────────────────────────────────────────

export async function getMetaTemplates(req: Request, res: Response) {
  // Cada número usa os templates da sua conta (WABA)
  const phoneNumberId = typeof req.query.phoneNumberId === "string" && req.query.phoneNumberId !== "all" ? req.query.phoneNumberId : undefined;
  res.json(await waService.listMetaTemplates(phoneNumberId));
}

export async function postMetaTemplate(req: Request, res: Response) {
  const { name, category, language, bodyText, exampleValues, phoneNumberId } = req.body as {
    name?: string; category?: string; language?: string; bodyText?: string; exampleValues?: string[]; phoneNumberId?: string;
  };
  if (!name || !bodyText) {
    res.status(400).json({ error: "Nome e texto são obrigatórios." });
    return;
  }
  const result = await waService.createMetaTemplate({
    name,
    category: category ?? "UTILITY",
    language: language ?? "pt_BR",
    bodyText,
    exampleValues,
  }, phoneNumberId && phoneNumberId !== "all" ? phoneNumberId : undefined);
  res.status(201).json(result);
}

export async function postTemplateMessage(req: Request, res: Response) {
  const {
    conversationId, phone, name, templateName, language, variables, headerVariables, buttonVariables,
    headerMediaUrl, headerMediaType, headerFileName, phoneNumberId, previewText,
  } = req.body as {
    conversationId?: string; phone?: string; name?: string; templateName?: string; language?: string;
    variables?: string[]; headerVariables?: string[]; buttonVariables?: { index: number; value: string }[];
    headerMediaUrl?: string; headerMediaType?: string; headerFileName?: string; phoneNumberId?: string; previewText?: string;
  };
  if ((!phone && !conversationId) || !templateName) {
    res.status(400).json({ error: "Número e template são obrigatórios." });
    return;
  }
  // Variável em branco fazia a Meta recusar (ia uma a menos do que o template pede)
  if ([...(variables ?? []), ...(headerVariables ?? []), ...(buttonVariables ?? []).map((b) => b.value)].some((v) => !String(v ?? "").trim())) {
    res.status(400).json({ error: "Preencha todas as variáveis do template." });
    return;
  }
  try {
    const result = await waService.startConversationWithTemplate({
      conversationId, phone, name, templateName, language: language ?? "pt_BR",
      params: { variables: variables ?? [], headerVariables, buttonVariables, headerMediaUrl, headerMediaType, headerFileName },
      previewText, sentById: req.user!.sub, phoneNumberId: phoneNumberId && phoneNumberId !== "all" ? phoneNumberId : undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao enviar template";
    console.error("[WhatsApp] Erro ao enviar template:", msg);
    res.status(400).json({ error: msg });
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(_req: Request, res: Response) {
  res.json(await waService.listAllTemplates());
}

export async function postTemplate(req: Request, res: Response) {
  const { name, text } = req.body as { name?: string; text?: string };
  if (!name || !text) {
    res.status(400).json({ error: "Nome e texto são obrigatórios." });
    return;
  }
  res.status(201).json(await waService.createTemplate({ name, text }));
}

export async function patchTemplate(req: Request, res: Response) {
  const { id } = req.params;
  const { name, text, active } = req.body as { name?: string; text?: string; active?: boolean };
  res.json(await waService.updateTemplate(id, { name, text, active }));
}

export async function deleteTemplate(req: Request, res: Response) {
  await waService.deleteTemplate(req.params.id);
  res.json({ ok: true });
}

// ─── Media upload ─────────────────────────────────────────────────────────────

export async function uploadMedia(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Arquivo é obrigatório." });
    return;
  }
  // Número que vai enviar a mídia (campo do formulário); sem ele, usa o principal
  const phoneNumberId = typeof req.body?.phoneNumberId === "string" && req.body.phoneNumberId !== "all" ? req.body.phoneNumberId : undefined;
  // O multer lê o nome como latin1: "Orçamento.pdf" viraria "OrÃ§amento.pdf" no celular do cliente
  const filename = Buffer.from(file.originalname, "latin1").toString("utf8");
  const { mediaId, localFilename } = await waService.uploadMediaToMeta(file.buffer, file.mimetype, filename, phoneNumberId);
  res.json({ mediaId, mimetype: file.mimetype, filename, localFilename });
}

export async function postMediaMessage(req: Request, res: Response) {
  const { id } = req.params;
  const { mediaId, mimetype, caption, localFilename, filename } = req.body as {
    mediaId?: string;
    mimetype?: string;
    caption?: string;
    localFilename?: string;
    filename?: string;
  };
  if (!mediaId || !mimetype) {
    res.status(400).json({ error: "mediaId e mimetype são obrigatórios." });
    return;
  }
  const message = await waService.sendMediaMessage(id, mediaId, mimetype, caption, req.user!.sub, localFilename ?? null, filename ?? null);
  res.json(message);
}

// ─── Labels ───────────────────────────────────────────────────────────────────

// Cada número tem as suas etiquetas; etiquetas sem número são gerais (aparecem em todos).
// Admin gerencia todas; quem tem número atribuído cria/exclui só as do próprio número.

export async function getLabels(req: Request, res: Response) {
  const requested = typeof req.query.phoneNumberId === "string" && req.query.phoneNumberId !== "all" ? req.query.phoneNumberId : undefined;
  if (req.user!.role === "ADMIN") {
    res.json(await waService.listLabels(requested));
    return;
  }
  const mine = await assignedPhoneOf(req.user!.sub);
  res.json(await waService.listLabels(mine ?? requested));
}

export async function postLabel(req: Request, res: Response) {
  const { name, color, phoneNumberId } = req.body as { name?: string; color?: string; phoneNumberId?: string | null };
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório." }); return; }
  let target: string | null = phoneNumberId && phoneNumberId !== "all" ? phoneNumberId : null;
  if (req.user!.role !== "ADMIN") {
    const mine = await assignedPhoneOf(req.user!.sub);
    if (!mine) {
      res.status(403).json({ error: "Você precisa ter um número de WhatsApp atribuído para criar etiquetas." });
      return;
    }
    target = mine;
  }
  if (await waService.findLabelByName(name.trim(), target)) {
    res.status(409).json({ error: "Já existe uma etiqueta com esse nome neste número." });
    return;
  }
  res.status(201).json(await waService.createLabel(name.trim(), color ?? "#22c55e", target));
}

export async function deleteLabel(req: Request, res: Response) {
  const label = await waService.getLabel(req.params.id);
  if (!label) { res.status(404).json({ error: "Etiqueta não encontrada." }); return; }
  if (req.user!.role !== "ADMIN") {
    const mine = await assignedPhoneOf(req.user!.sub);
    if (!mine || label.phoneNumberId !== mine) {
      res.status(403).json({ error: "Você só pode excluir etiquetas do seu número." });
      return;
    }
  }
  await waService.deleteLabel(req.params.id);
  res.json({ ok: true });
}

export async function postConversationLabel(req: Request, res: Response) {
  const [label, conversation] = await Promise.all([
    waService.getLabel(req.params.labelId),
    waService.getConversation(req.params.id),
  ]);
  if (!label) { res.status(404).json({ error: "Etiqueta não encontrada." }); return; }
  // Etiqueta de um número não pode ser usada em conversa de outro número
  if (label.phoneNumberId && label.phoneNumberId !== "all" && conversation.phoneNumberId && label.phoneNumberId !== conversation.phoneNumberId) {
    res.status(400).json({ error: "Esta etiqueta é de outro número de WhatsApp." });
    return;
  }
  await waService.addLabelToConversation(req.params.id, req.params.labelId);
  res.json(await waService.getConversation(req.params.id));
}

export async function deleteConversationLabel(req: Request, res: Response) {
  await waService.removeLabelFromConversation(req.params.id, req.params.labelId);
  res.json(await waService.getConversation(req.params.id));
}

// ─── Agents ────────────────────────────────────────────────────────────────────

export async function getAgents(_req: Request, res: Response) {
  res.json(await waService.listAgents());
}

// ─── Phone numbers ────────────────────────────────────────────────────────────

export async function getPhoneNumbers(_req: Request, res: Response) {
  res.json(await waService.listPhoneNumbers());
}

export async function postPhoneNumber(req: Request, res: Response) {
  const { phoneNumberId, displayName, phone, accessToken, wabaId } = req.body as {
    phoneNumberId?: string; displayName?: string; phone?: string; accessToken?: string; wabaId?: string;
  };
  if (!phoneNumberId || !displayName) {
    res.status(400).json({ error: "phoneNumberId e displayName são obrigatórios." });
    return;
  }
  res.json(await waService.createPhoneNumber({ phoneNumberId, displayName, phone, accessToken, wabaId: wabaId?.trim() || undefined }));
}

export async function patchPhoneNumber(req: Request, res: Response) {
  const { id } = req.params;
  const { displayName, phone, accessToken, active, wabaId } = req.body as {
    displayName?: string; phone?: string; accessToken?: string; active?: boolean; wabaId?: string;
  };
  res.json(await waService.updatePhoneNumber(id, {
    displayName, phone, accessToken, active,
    ...(wabaId !== undefined ? { wabaId: wabaId.trim() || null } : {}),
  }));
}

export async function deletePhoneNumber(req: Request, res: Response) {
  await waService.deletePhoneNumber(req.params.id);
  res.json({ ok: true });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(_req: Request, res: Response) {
  res.json(await waService.getStats());
}

// ─── Legacy send (kept for compatibility) ────────────────────────────────────

export async function sendMessage(req: Request, res: Response) {
  const { to, text } = req.body as { to?: string; text?: string };
  if (!to || !text) {
    res.status(400).json({ error: "Campos 'to' e 'text' são obrigatórios." });
    return;
  }
  await waService.sendTextToMeta(to, text);
  res.json({ ok: true });
}

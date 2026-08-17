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

  // Log raw webhook for debugging
  try {
    const entry = (req.body as Record<string, unknown>)?.entry as unknown[];
    const change = ((entry?.[0] as Record<string, unknown>)?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value = change?.value as Record<string, unknown>;
    if (value?.messages) {
      const msgs = value.messages as Record<string, unknown>[];
      console.log("[WhatsApp webhook] incoming:", JSON.stringify(msgs[0]).slice(0, 400));
    }
  } catch { /* ignore log errors */ }

  // Handle delivery/read status updates
  const statusUpdate = waService.parseStatusUpdate(req.body);
  if (statusUpdate) {
    await waService.handleStatusUpdate(statusUpdate).catch((err) =>
      console.error("[WhatsApp] Erro ao atualizar status:", err)
    );
  }

  // Handle incoming messages
  const msg = waService.parseIncomingMessage(req.body);
  if (!msg) return;

  console.log("[WhatsApp] parsed msg type=%s from=%s mediaType=%s text=%s", msg.mediaType ?? "text", msg.from, msg.mediaType, msg.text?.slice(0, 80));

  try {
    await waService.handleIncomingMessage(msg);
  } catch (err) {
    console.error("[WhatsApp] Erro ao processar mensagem:", err);
  }
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function startConversation(req: Request, res: Response) {
  const { phone, name, text } = req.body as { phone?: string; name?: string; text?: string };
  if (!phone || !text?.trim()) {
    res.status(400).json({ error: "Número e mensagem são obrigatórios." });
    return;
  }
  const result = await waService.startConversation(phone, name ?? phone, text, req.user!.sub);
  res.status(201).json(result);
}

export async function getConversations(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json(await waService.listConversations(status));
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

export async function postMessage(req: Request, res: Response) {
  const { id } = req.params;
  const { text, replyToId, isInternal } = req.body as { text?: string; replyToId?: string; isInternal?: boolean };
  if (!text?.trim()) {
    res.status(400).json({ error: "Texto é obrigatório." });
    return;
  }
  const message = await waService.sendConversationMessage(id, text, req.user!.sub, replyToId, isInternal);
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

export async function getAutomations(_req: Request, res: Response) {
  res.json(await waService.listAutomations());
}

export async function postAutomation(req: Request, res: Response) {
  const { name, keyword, matchType, response, active } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    response?: string;
    active?: boolean;
  };
  if (!name || !keyword || !response) {
    res.status(400).json({ error: "Nome, keyword e resposta são obrigatórios." });
    return;
  }
  res.status(201).json(await waService.createAutomation({ name, keyword, matchType, response, active }));
}

export async function patchAutomation(req: Request, res: Response) {
  const { id } = req.params;
  const { name, keyword, matchType, response, active } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    response?: string;
    active?: boolean;
  };
  res.json(await waService.updateAutomation(id, { name, keyword, matchType, response, active }));
}

export async function deleteAutomation(req: Request, res: Response) {
  const { id } = req.params;
  await waService.deleteAutomation(id);
  res.json({ ok: true });
}

// ─── Meta Message Templates ───────────────────────────────────────────────────

export async function getMetaTemplates(_req: Request, res: Response) {
  res.json(await waService.listMetaTemplates());
}

export async function postMetaTemplate(req: Request, res: Response) {
  const { name, category, language, bodyText, exampleValues } = req.body as {
    name?: string; category?: string; language?: string; bodyText?: string; exampleValues?: string[];
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
  });
  res.status(201).json(result);
}

export async function postTemplateMessage(req: Request, res: Response) {
  const { phone, name, templateName, language, variables, headerMediaUrl, headerMediaType, headerFileName } = req.body as {
    phone?: string; name?: string; templateName?: string; language?: string;
    variables?: string[]; headerMediaUrl?: string; headerMediaType?: string; headerFileName?: string;
  };
  if (!phone || !templateName) {
    res.status(400).json({ error: "Número e template são obrigatórios." });
    return;
  }
  try {
    const result = await waService.startConversationWithTemplate(
      phone, name ?? phone, templateName, language ?? "pt_BR", variables ?? [],
      req.user!.sub, headerMediaUrl, headerMediaType, headerFileName
    );
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao enviar template";
    console.error("[WhatsApp] Erro ao enviar template:", msg);
    res.status(500).json({ error: msg });
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
  const { mediaId, localFilename } = await waService.uploadMediaToMeta(file.buffer, file.mimetype, file.originalname);
  res.json({ mediaId, mimetype: file.mimetype, filename: file.originalname, localFilename });
}

export async function postMediaMessage(req: Request, res: Response) {
  const { id } = req.params;
  const { mediaId, mimetype, caption, localFilename } = req.body as {
    mediaId?: string;
    mimetype?: string;
    caption?: string;
    localFilename?: string;
  };
  if (!mediaId || !mimetype) {
    res.status(400).json({ error: "mediaId e mimetype são obrigatórios." });
    return;
  }
  const message = await waService.sendMediaMessage(id, mediaId, mimetype, caption, req.user!.sub, localFilename ?? null);
  res.json(message);
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export async function getLabels(_req: Request, res: Response) {
  res.json(await waService.listLabels());
}

export async function postLabel(req: Request, res: Response) {
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório." }); return; }
  res.status(201).json(await waService.createLabel(name.trim(), color ?? "#22c55e"));
}

export async function deleteLabel(req: Request, res: Response) {
  await waService.deleteLabel(req.params.id);
  res.json({ ok: true });
}

export async function postConversationLabel(req: Request, res: Response) {
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

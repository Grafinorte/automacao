import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";

const GRAPH_URL = "https://graph.facebook.com/v22.0";

// ─── HTTP com retry (ECONNRESET / falhas de rede) ────────────────────────────

const metaHttp = axios.create({
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

async function metaPost(url: string, data: unknown, authToken: string, retries = 3): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await metaHttp.post(url, data, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      return res.data;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const isNetwork = code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "ECONNABORTED";
      if (isNetwork && attempt < retries) {
        console.warn(`[WhatsApp] conexão falhou (${code}), tentativa ${attempt}/${retries}. Aguardando ${1500 * attempt}ms...`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      const status = (err as { response?: { status: number; data: unknown } })?.response?.status;
      const body = (err as { response?: { data: unknown } })?.response?.data;
      if (status) throw new Error(`WhatsApp API error ${status}: ${JSON.stringify(body)}`);
      throw err;
    }
  }
  throw new Error("metaPost: todas as tentativas falharam");
}

async function metaGet(url: string, authToken: string): Promise<unknown> {
  const res = await metaHttp.get(url, { headers: { Authorization: `Bearer ${authToken}` } });
  return res.data;
}

// ─── Meta API ────────────────────────────────────────────────────────────────

export async function sendTextToMeta(to: string, text: string, contextMessageId?: string, phoneNumberId?: string): Promise<string> {
  const url = `${GRAPH_URL}/${phoneNumberId || env.whatsappPhoneNumberId}/messages`;
  const data = await metaPost(url, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
    ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
  }, env.whatsappAccessToken) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? "";
}

// ─── Webhook parsing ──────────────────────────────────────────────────────────

export interface IncomingMessage {
  from: string;
  name: string;
  text: string;
  messageId: string;
  timestamp: number;
  phoneNumberId?: string;
  mediaType?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  replyToWaMessageId?: string;
}

export interface StatusUpdate {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
}

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

export function parseIncomingMessage(body: unknown): IncomingMessage | null {
  try {
    const b = body as Record<string, unknown>;
    const entry = (b.entry as unknown[])?.[0] as Record<string, unknown>;
    const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value = change?.value as Record<string, unknown>;
    const messages = value?.messages as unknown[];
    if (!messages?.length) return null;

    const msg = messages[0] as Record<string, unknown>;
    const msgType = msg.type as string;
    const context = msg.context as Record<string, unknown> | undefined;

    const contacts = value?.contacts as unknown[];
    const contact = (contacts?.[0] ?? {}) as Record<string, unknown>;
    const profile = (contact?.profile ?? {}) as Record<string, unknown>;

    const metadata = value?.metadata as Record<string, unknown> | undefined;
    const base = {
      from: msg.from as string,
      name: (profile?.name as string) ?? (msg.from as string),
      messageId: msg.id as string,
      timestamp: Number(msg.timestamp),
      phoneNumberId: metadata?.phone_number_id as string | undefined,
      replyToWaMessageId: context?.id as string | undefined,
    };

    if (msgType === "text") {
      return { ...base, text: ((msg.text as Record<string, unknown>)?.body as string) ?? "" };
    }

    if (MEDIA_TYPES.includes(msgType)) {
      const mediaObj = (msg[msgType] ?? {}) as Record<string, unknown>;
      return {
        ...base,
        text: (mediaObj.caption as string) ?? "",
        mediaType: msgType,
        mediaId: mediaObj.id as string,
        mimeType: mediaObj.mime_type as string,
        filename: mediaObj.filename as string | undefined,
      };
    }

    if (msgType === "contacts") {
      const sharedContacts = (msg.contacts as Record<string, unknown>[]) ?? [];
      const first = (sharedContacts[0] ?? {}) as Record<string, unknown>;
      const nameObj = (first.name ?? {}) as Record<string, unknown>;
      const contactName = (nameObj.formatted_name ?? nameObj.first_name ?? "Contato") as string;
      const phones = (first.phones as Record<string, unknown>[]) ?? [];
      const phoneList = phones.map(p => p.phone as string).filter(Boolean);
      // Store as "📇 Name\nphone1\nphone2" so frontend can render a card
      return { ...base, text: [`📇 ${contactName}`, ...phoneList].join("\n") };
    }

    if (msgType === "location") {
      const loc = (msg.location ?? {}) as Record<string, unknown>;
      const name = (loc.name as string) ?? "";
      const address = (loc.address as string) ?? "";
      const lat = loc.latitude as number;
      const lng = loc.longitude as number;
      const label = name || address || `${lat},${lng}`;
      return { ...base, text: `📍 ${label}` };
    }

    if (msgType === "reaction") {
      const reaction = (msg.reaction ?? {}) as Record<string, unknown>;
      const emoji = (reaction.emoji as string) ?? "👍";
      return { ...base, text: `reação: ${emoji}` };
    }

    if (msgType === "interactive") {
      const interactive = (msg.interactive ?? {}) as Record<string, unknown>;
      const btnReply = (interactive.button_reply ?? {}) as Record<string, unknown>;
      const listReply = (interactive.list_reply ?? {}) as Record<string, unknown>;
      const title = (btnReply.title ?? listReply.title ?? "[interativo]") as string;
      return { ...base, text: title };
    }

    if (msgType === "button") {
      const button = (msg.button ?? {}) as Record<string, unknown>;
      return { ...base, text: (button.text as string) ?? "[botão]" };
    }

    return { ...base, text: `[${msgType}]` };
  } catch {
    return null;
  }
}

export function parseStatusUpdate(body: unknown): StatusUpdate | null {
  try {
    const b = body as Record<string, unknown>;
    const entry = (b.entry as unknown[])?.[0] as Record<string, unknown>;
    const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value = change?.value as Record<string, unknown>;
    const statuses = value?.statuses as unknown[];
    if (!statuses?.length) return null;

    const s = statuses[0] as Record<string, unknown>;
    const status = s.status as string;
    if (!["sent", "delivered", "read", "failed"].includes(status)) return null;

    return { waMessageId: s.id as string, status: status as StatusUpdate["status"] };
  } catch {
    return null;
  }
}

export async function handleStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.waMessage.updateMany({
    where: { waMessageId: update.waMessageId },
    data: { status: update.status },
  });
}

// ─── Media download from Meta ─────────────────────────────────────────────────

async function downloadMediaFromMeta(mediaId: string, mimeType: string): Promise<string | null> {
  try {
    const infoRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
    });
    if (!infoRes.ok) return null;
    const info = await infoRes.json() as { url?: string };
    if (!info.url) return null;

    const binRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
    });
    if (!binRes.ok) return null;

    const ext = mimeType.split(";")[0].split("/")[1] || "bin";
    const savedFilename = `${mediaId}.${ext}`;
    const dir = path.join(__dirname, "../../../data/wa-media");
    await fs.promises.mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await binRes.arrayBuffer());
    await fs.promises.writeFile(path.join(dir, savedFilename), buffer);

    return savedFilename;
  } catch (err) {
    console.error("[WA Media] Erro ao baixar mídia:", err);
    return null;
  }
}

// ─── Incoming message handler ─────────────────────────────────────────────────

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  // Normalize phone: WhatsApp webhooks send without "+", but startConversation stores with "+"
  const rawPhone = msg.from;
  const normalizedPhone = rawPhone.replace(/^00/, "+").replace(/^(?!\+)/, "+");

  // Find contact by either format (handles legacy records stored without "+")
  // Prefer older record (has the conversation history)
  let contact = await prisma.waContact.findFirst({
    where: { OR: [{ phone: normalizedPhone }, { phone: rawPhone }] },
    orderBy: { createdAt: "asc" },
  });

  if (contact) {
    // Fix phone format if stored in old format, and update name
    const updates: { name: string; phone?: string } = { name: msg.name };
    if (contact.phone !== normalizedPhone) {
      const conflict = await prisma.waContact.findUnique({ where: { phone: normalizedPhone } });
      if (!conflict) updates.phone = normalizedPhone;
    }
    contact = await prisma.waContact.update({ where: { id: contact.id }, data: updates });
  } else {
    contact = await prisma.waContact.create({
      data: { phone: normalizedPhone, name: msg.name },
    });
  }

  // Find open conversation — prefer matching phoneNumberId, fall back to any open, then reopen closed
  let conversation = await prisma.waConversation.findFirst({
    where: msg.phoneNumberId
      ? { contactId: contact.id, status: "open", phoneNumberId: msg.phoneNumberId }
      : { contactId: contact.id, status: "open" },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    // Try any open conversation for this contact (in case phoneNumberId differs)
    conversation = await prisma.waConversation.findFirst({
      where: { contactId: contact.id, status: "open" },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!conversation) {
    // Reopen the most recent closed conversation instead of creating a new one
    const closed = await prisma.waConversation.findFirst({
      where: { contactId: contact.id, status: "closed" },
      orderBy: { updatedAt: "desc" },
    });
    if (closed) {
      conversation = await prisma.waConversation.update({
        where: { id: closed.id },
        data: {
          status: "open",
          ...(msg.phoneNumberId ? { phoneNumberId: msg.phoneNumberId } : {}),
        },
      });
    } else {
      conversation = await prisma.waConversation.create({
        data: { contactId: contact.id, phoneNumberId: msg.phoneNumberId ?? null },
      });
    }
  }

  // Save message (skip if already saved — Meta can retry the same event)
  const existing = await prisma.waMessage.findFirst({ where: { waMessageId: msg.messageId } });
  if (existing) return;

  // Download media from Meta if applicable
  let savedMediaUrl: string | null = null;
  if (msg.mediaId && msg.mediaType && msg.mimeType) {
    savedMediaUrl = await downloadMediaFromMeta(msg.mediaId, msg.mimeType);
  }

  // Resolve replyTo
  let replyToId: string | null = null;
  if (msg.replyToWaMessageId) {
    const ref = await prisma.waMessage.findFirst({ where: { waMessageId: msg.replyToWaMessageId } });
    replyToId = ref?.id ?? null;
  }

  const displayText = msg.text || (msg.mediaType ? `[${msg.mediaType}]` : "");

  await prisma.waMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      text: displayText,
      waMessageId: msg.messageId,
      status: "delivered",
      mediaType: msg.mediaType ?? null,
      mediaUrl: savedMediaUrl,
      filename: msg.filename ?? null,
      replyToId,
    },
  });

  const lastText = msg.text || `📎 ${msg.mediaType ?? "arquivo"}`;

  // Update conversation summary
  await prisma.waConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(msg.timestamp * 1000),
      lastMessageText: lastText,
      unreadCount: { increment: 1 },
    },
  });

  // Run automations
  await runAutomations(conversation.id, contact.phone, msg.text);
}

// ─── Automations ──────────────────────────────────────────────────────────────

async function runAutomations(conversationId: string, phone: string, text: string): Promise<void> {
  const automations = await prisma.waAutomation.findMany({ where: { active: true } });
  const lower = text.toLowerCase();

  for (const auto of automations) {
    const kw = auto.keyword.toLowerCase();
    const matches =
      auto.matchType === "exact"
        ? lower === kw
        : auto.matchType === "starts_with"
          ? lower.startsWith(kw)
          : lower.includes(kw);

    if (!matches) continue;

    try {
      const waId = await sendTextToMeta(phone, auto.response);
      await prisma.waMessage.create({
        data: {
          conversationId,
          direction: "outbound",
          text: auto.response,
          waMessageId: waId || undefined,
          status: "sent",
        },
      });
      await prisma.waConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), lastMessageText: auto.response },
      });
    } catch (err) {
      console.error("[WA Automation] Erro ao enviar resposta automática:", err);
    }
    break; // first match wins
  }
}

// ─── Start conversation (outbound-initiated) ──────────────────────────────────

export async function startConversation(phone: string, name: string, text: string, sentById: string) {
  // Normalize phone: remove spaces, dashes, parens; ensure starts with +
  const normalized = phone.replace(/[\s\-().]/g, "").replace(/^00/, "+").replace(/^(?!\+)/, "+");

  // Use sender's dedicated WA number if configured
  const sender = await prisma.user.findUnique({ where: { id: sentById }, select: { waPhoneNumberId: true } });
  const phoneNumberId = sender?.waPhoneNumberId ?? undefined;

  const contact = await prisma.waContact.upsert({
    where: { phone: normalized },
    update: {},
    create: { phone: normalized, name: name || normalized },
  });

  let conversation = await prisma.waConversation.findFirst({
    where: { contactId: contact.id, ...(phoneNumberId ? { phoneNumberId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.waConversation.create({
      data: { contactId: contact.id, phoneNumberId: phoneNumberId ?? null },
    });
  } else if (conversation.status === "closed") {
    conversation = await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { status: "open" },
    });
  }

  const waId = await sendTextToMeta(normalized, text, undefined, phoneNumberId);

  const message = await prisma.waMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      text,
      waMessageId: waId || undefined,
      status: "sent",
      sentById,
    },
    include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await prisma.waConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessageText: text },
  });

  return { conversation, message };
}

// ─── Conversations ────────────────────────────────────────────────────────────

const CONV_INCLUDE = {
  contact: true,
  assignedTo: { select: { id: true, name: true, avatarUrl: true } },
  labels: { include: { label: true } },
} as const;

export async function listConversations(status?: string) {
  return prisma.waConversation.findMany({
    where: status ? { status } : undefined,
    include: CONV_INCLUDE,
    orderBy: [{ pinned: "desc" }, { unreadCount: "desc" }, { lastMessageAt: "desc" }],
  });
}

export async function getConversation(id: string) {
  return prisma.waConversation.findUniqueOrThrow({
    where: { id },
    include: CONV_INCLUDE,
  });
}

export async function getMessages(conversationId: string) {
  return prisma.waMessage.findMany({
    where: { conversationId },
    include: {
      sentBy: { select: { id: true, name: true, avatarUrl: true } },
      replyTo: { include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function markConversationRead(conversationId: string) {
  return prisma.waConversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });
}

export async function closeConversation(conversationId: string) {
  return prisma.waConversation.update({
    where: { id: conversationId },
    data: { status: "closed" },
  });
}

export async function reopenConversation(conversationId: string) {
  return prisma.waConversation.update({
    where: { id: conversationId },
    data: { status: "open" },
  });
}

export async function assignConversation(conversationId: string, userId: string | null) {
  return prisma.waConversation.update({
    where: { id: conversationId },
    data: { assignedToId: userId },
  });
}

export async function togglePin(conversationId: string, pinned: boolean) {
  return prisma.waConversation.update({
    where: { id: conversationId },
    data: { pinned },
  });
}

// ─── Send message from panel ──────────────────────────────────────────────────

export async function sendConversationMessage(
  conversationId: string,
  text: string,
  sentById: string,
  replyToId?: string,
  isInternal?: boolean
) {
  const MSG_INCLUDE = {
    sentBy: { select: { id: true, name: true, avatarUrl: true } },
    replyTo: { include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } } },
  } as const;

  if (isInternal) {
    const message = await prisma.waMessage.create({
      data: { conversationId, direction: "outbound", isInternal: true, text, status: "sent", sentById, replyToId: replyToId ?? null },
      include: MSG_INCLUDE,
    });
    return message;
  }

  const conv = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { contact: true },
  });

  let contextMessageId: string | undefined;
  if (replyToId) {
    const ref = await prisma.waMessage.findUnique({ where: { id: replyToId } });
    contextMessageId = ref?.waMessageId ?? undefined;
  }

  const phoneNumberId = conv.phoneNumberId ?? undefined;
  const waId = await sendTextToMeta(conv.contact.phone, text, contextMessageId, phoneNumberId);

  const message = await prisma.waMessage.create({
    data: { conversationId, direction: "outbound", text, waMessageId: waId || undefined, status: "sent", sentById, replyToId: replyToId ?? null },
    include: MSG_INCLUDE,
  });

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessageText: text },
  });

  return message;
}

// ─── Edit message ─────────────────────────────────────────────────────────────

export async function deleteMessage(id: string) {
  await prisma.waMessage.delete({ where: { id } });
}

export async function editMessageText(id: string, text: string) {
  return prisma.waMessage.update({
    where: { id },
    data: { text },
    include: {
      sentBy: { select: { id: true, name: true, avatarUrl: true } },
      replyTo: { include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function listContacts() {
  return prisma.waContact.findMany({ orderBy: { name: "asc" } });
}

export async function updateContact(id: string, data: { name?: string; notes?: string; crmContactId?: string | null }) {
  return prisma.waContact.update({ where: { id }, data });
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function listLabels() {
  return prisma.waLabel.findMany({ orderBy: { name: "asc" } });
}

export function createLabel(name: string, color: string) {
  return prisma.waLabel.create({ data: { name, color } });
}

export function deleteLabel(id: string) {
  return prisma.waLabel.delete({ where: { id } });
}

export function addLabelToConversation(conversationId: string, labelId: string) {
  return prisma.waConversationLabel.upsert({
    where: { conversationId_labelId: { conversationId, labelId } },
    create: { conversationId, labelId },
    update: {},
  });
}

export function removeLabelFromConversation(conversationId: string, labelId: string) {
  return prisma.waConversationLabel.delete({
    where: { conversationId_labelId: { conversationId, labelId } },
  });
}

// ─── Agents ────────────────────────────────────────────────────────────────────

export function listAgents() {
  return prisma.user.findMany({
    select: { id: true, name: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
}

// ─── Automations CRUD ─────────────────────────────────────────────────────────

export async function listAutomations() {
  return prisma.waAutomation.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createAutomation(data: {
  name: string;
  keyword: string;
  matchType?: string;
  response: string;
  active?: boolean;
}) {
  return prisma.waAutomation.create({ data });
}

export async function updateAutomation(
  id: string,
  data: { name?: string; keyword?: string; matchType?: string; response?: string; active?: boolean }
) {
  return prisma.waAutomation.update({ where: { id }, data });
}

export async function deleteAutomation(id: string) {
  return prisma.waAutomation.delete({ where: { id } });
}

// ─── Meta Message Templates ───────────────────────────────────────────────────

export async function listMetaTemplates() {
  const wabaId = env.whatsappBusinessAccountId;
  if (!wabaId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID não configurado.");
  const url = `${GRAPH_URL}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=50`;
  const res = await metaHttp.get(url, { headers: { Authorization: `Bearer ${env.whatsappAccessToken}` } }).catch(e => { throw new Error(`WhatsApp API error: ${e.message}`); });
  return (res.data as { data: unknown[] }).data ?? [];
}

export async function createMetaTemplate(payload: {
  name: string;
  category: string;
  language: string;
  bodyText: string;
  exampleValues?: string[];
}) {
  const wabaId = env.whatsappBusinessAccountId;
  if (!wabaId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID não configurado.");

  const body: Record<string, unknown> = {
    name: payload.name.toLowerCase().replace(/\s+/g, "_"),
    category: payload.category,
    language: payload.language,
    components: [
      {
        type: "BODY",
        text: payload.bodyText,
        ...(payload.exampleValues?.length
          ? { example: { body_text: [payload.exampleValues] } }
          : {}),
      },
    ],
  };

  const url = `${GRAPH_URL}/${wabaId}/message_templates`;
  return await metaPost(url, body, env.whatsappAccessToken);
}

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  language: string,
  variables: string[],
  headerMediaUrl?: string,
  headerMediaType?: string,
  phoneNumberId?: string,
  headerFileName?: string
): Promise<string> {
  const url = `${GRAPH_URL}/${phoneNumberId || env.whatsappPhoneNumberId}/messages`;

  const components: object[] = [];

  // Header component (image/video/document) — prefer mediaId over URL
  if (headerMediaType) {
    const mediaKey = headerMediaType.toLowerCase();
    if (headerMediaUrl) {
      const isId = /^\d{10,}$/.test(headerMediaUrl);
      const mediaObj: Record<string, unknown> = isId ? { id: headerMediaUrl } : { link: headerMediaUrl };
      if (mediaKey === "document" && headerFileName) mediaObj.filename = headerFileName;
      components.push({
        type: "header",
        parameters: [{ type: mediaKey, [mediaKey]: mediaObj }],
      });
    }
  }

  // Body component (text variables)
  if (variables.length) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({ type: "text", text: v })),
    });
  }

  const data = await metaPost(url, {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: { name: templateName, language: { code: language }, components },
  }, env.whatsappAccessToken) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? "";
}

export async function startConversationWithTemplate(
  phone: string,
  name: string,
  templateName: string,
  language: string,
  variables: string[],
  sentById: string,
  headerMediaUrl?: string,
  headerMediaType?: string,
  headerFileName?: string
) {
  const normalized = phone.replace(/[\s\-().]/g, "").replace(/^00/, "+").replace(/^(?!\+)/, "+");

  const sender = await prisma.user.findUnique({ where: { id: sentById }, select: { waPhoneNumberId: true } });
  const phoneNumberId = sender?.waPhoneNumberId ?? undefined;

  const contact = await prisma.waContact.upsert({
    where: { phone: normalized },
    update: {},
    create: { phone: normalized, name: name || normalized },
  });

  // Reuse the most recent conversation regardless of status — reopen if closed
  let conversation = await prisma.waConversation.findFirst({
    where: { contactId: contact.id, ...(phoneNumberId ? { phoneNumberId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.waConversation.create({ data: { contactId: contact.id, phoneNumberId: phoneNumberId ?? null } });
  } else if (conversation.status === "closed") {
    conversation = await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { status: "open" },
    });
  }

  const waId = await sendTemplateMessage(normalized, templateName, language, variables, headerMediaUrl, headerMediaType, phoneNumberId, headerFileName);

  const bodyText = variables.length
    ? `[Template: ${templateName}] ${variables.join(", ")}`
    : `[Template: ${templateName}]`;

  const message = await prisma.waMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      text: bodyText,
      waMessageId: waId || undefined,
      status: "sent",
      sentById,
    },
    include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await prisma.waConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessageText: bodyText },
  });

  return { conversation, message };
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates() {
  return prisma.waTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function listAllTemplates() {
  return prisma.waTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createTemplate(data: { name: string; text: string }) {
  return prisma.waTemplate.create({ data });
}

export async function updateTemplate(id: string, data: { name?: string; text?: string; active?: boolean }) {
  return prisma.waTemplate.update({ where: { id }, data });
}

export async function deleteTemplate(id: string) {
  return prisma.waTemplate.delete({ where: { id } });
}

// ─── Media upload ─────────────────────────────────────────────────────────────

export async function uploadMediaToMeta(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<{ mediaId: string; localFilename: string }> {
  const url = `${GRAPH_URL}/${env.whatsappPhoneNumberId}/media`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimetype);
  form.append("file", new Blob([buffer], { type: mimetype }), filename);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp media upload error: ${JSON.stringify(err)}`);
  }
  const data = (await res.json()) as { id: string };
  const mediaId = data.id;

  // Save a local copy for outbound display
  const ext = mimetype.split(";")[0].split("/")[1] || "bin";
  const localFilename = `${mediaId}.${ext}`;
  const dir = path.join(__dirname, "../../../data/wa-media");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, localFilename), buffer);

  return { mediaId, localFilename };
}

export async function sendMediaMessage(
  conversationId: string,
  mediaId: string,
  mimetype: string,
  caption: string | undefined,
  sentById: string,
  localFilename: string | null
) {
  const conv = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { contact: true },
  });

  const isImage = mimetype.startsWith("image/");
  const isVideo = mimetype.startsWith("video/");
  const isAudio = mimetype.startsWith("audio/");
  const mediaType = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "document";

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: conv.contact.phone,
    type: mediaType,
    [mediaType]: { id: mediaId, ...(caption ? { caption } : {}) },
  };

  const url = `${GRAPH_URL}/${env.whatsappPhoneNumberId}/messages`;
  const result = await metaPost(url, body, env.whatsappAccessToken) as { messages?: { id: string }[] };
  const waId = result.messages?.[0]?.id;

  const message = await prisma.waMessage.create({
    data: {
      conversationId,
      direction: "outbound",
      text: caption ?? null,
      waMessageId: waId || undefined,
      status: "sent",
      sentById,
      mediaType,
      mediaUrl: localFilename,
    },
    include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessageText: caption ?? `📎 ${mediaType}` },
  });

  return message;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats() {
  const [open, unread, total] = await Promise.all([
    prisma.waConversation.count({ where: { status: "open" } }),
    prisma.waConversation.aggregate({ _sum: { unreadCount: true } }),
    prisma.waConversation.count(),
  ]);
  return { open, unread: unread._sum.unreadCount ?? 0, total };
}

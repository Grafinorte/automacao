import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { broadcastWaMessage } from "../notifications/notifications.service";
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

async function getPhoneConfig(phoneNumberId?: string | null): Promise<{ phoneNumberId: string; accessToken: string }> {
  if (phoneNumberId) {
    const record = await prisma.waPhoneNumber.findUnique({ where: { phoneNumberId } });
    if (record) {
      // "||" e não "??": token salvo em branco também cai no token principal
      return { phoneNumberId: record.phoneNumberId, accessToken: record.accessToken || env.whatsappAccessToken };
    }
  }
  return { phoneNumberId: env.whatsappPhoneNumberId, accessToken: env.whatsappAccessToken };
}

/** Conta (WABA) e token de um número — templates ficam na conta; sem configuração usa a principal */
async function getWabaConfig(phoneNumberId?: string | null): Promise<{ wabaId: string; accessToken: string }> {
  if (phoneNumberId) {
    const record = await prisma.waPhoneNumber.findUnique({ where: { phoneNumberId } });
    if (record?.wabaId) {
      return { wabaId: record.wabaId, accessToken: record.accessToken || env.whatsappAccessToken };
    }
  }
  if (!env.whatsappBusinessAccountId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID não configurado.");
  return { wabaId: env.whatsappBusinessAccountId, accessToken: env.whatsappAccessToken };
}

export async function sendTextToMeta(to: string, text: string, contextMessageId?: string, phoneNumberId?: string): Promise<string> {
  const cfg = await getPhoneConfig(phoneNumberId);
  const url = `${GRAPH_URL}/${cfg.phoneNumberId}/messages`;
  const normalizedTo = to.replace(/^\+/, "");
  console.log(`[WA Send] to=${normalizedTo} phoneNumberId=${cfg.phoneNumberId} tokenLen=${cfg.accessToken?.length ?? 0}`);
  const data = await metaPost(url, {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "text",
    text: { body: text },
    ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
  }, cfg.accessToken) as { messages?: { id: string }[] };
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

/** Todos os "value" do webhook — a Meta pode juntar vários eventos (entries/changes) num único aviso */
function webhookValues(body: unknown): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  for (const entry of ((body as Record<string, unknown>)?.entry as Record<string, unknown>[] | undefined) ?? []) {
    for (const change of (entry?.changes as Record<string, unknown>[] | undefined) ?? []) {
      if (change?.value) values.push(change.value as Record<string, unknown>);
    }
  }
  return values;
}

/** Todas as mensagens do aviso (antes só a primeira era salva: áudio + textos em sequência perdiam os textos) */
export function parseIncomingMessages(body: unknown): IncomingMessage[] {
  const result: IncomingMessage[] = [];
  for (const value of webhookValues(body)) {
    const contacts = (value.contacts as Record<string, unknown>[] | undefined) ?? [];
    for (const msg of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
      const contact = contacts.find((c) => c.wa_id === msg.from) ?? contacts[0];
      const parsed = parseOneMessage(msg, contact, value.metadata as Record<string, unknown> | undefined);
      if (parsed) result.push(parsed);
    }
  }
  return result;
}

function parseOneMessage(msg: Record<string, unknown>, contact: Record<string, unknown> | undefined, metadata: Record<string, unknown> | undefined): IncomingMessage | null {
  try {
    const msgType = msg.type as string;
    const context = msg.context as Record<string, unknown> | undefined;
    const profile = (contact?.profile ?? {}) as Record<string, unknown>;

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

export function parseStatusUpdates(body: unknown): StatusUpdate[] {
  const result: StatusUpdate[] = [];
  for (const value of webhookValues(body)) {
    for (const s of (value.statuses as Record<string, unknown>[] | undefined) ?? []) {
      const status = s.status as string;
      if (!["sent", "delivered", "read", "failed"].includes(status)) continue;

      if (status === "failed") {
        // Motivo da falha (ex.: mídia inválida para este número, janela de 24h fechada) — fica no log do servidor
        const e = (s.errors as Record<string, unknown>[] | undefined)?.[0];
        console.warn(`[WhatsApp] Mensagem ${s.id} falhou para ${s.recipient_id}: ${e?.code ?? "?"} ${e?.title ?? ""} ${JSON.stringify(e?.error_data ?? "")}`);
      }
      result.push({ waMessageId: s.id as string, status: status as StatusUpdate["status"] });
    }
  }
  return result;
}

export async function handleStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.waMessage.updateMany({
    where: { waMessageId: update.waMessageId },
    data: { status: update.status },
  });
}

// ─── Media download from Meta ─────────────────────────────────────────────────

async function downloadMediaFromMeta(mediaId: string, mimeType: string, phoneNumberId?: string | null): Promise<string | null> {
  try {
    // Token do número que recebeu a mídia (outra conta pode precisar de outro token)
    const { accessToken } = await getPhoneConfig(phoneNumberId);
    const infoRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return null;
    const info = await infoRes.json() as { url?: string };
    if (!info.url) return null;

    const binRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
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

/**
 * Celular brasileiro com e sem o nono dígito: a Meta costuma mandar "554399998888" para um número
 * salvo como "+5543999998888" — sem isso, as respostas do cliente caíam num contato/conversa à parte.
 */
function brPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const variants = [digits];
  if (digits.startsWith("55")) {
    const ddd = digits.slice(2, 4), local = digits.slice(4);
    if (local.length === 9 && local[0] === "9") variants.push("55" + ddd + local.slice(1));
    if (local.length === 8 && /[6-9]/.test(local[0])) variants.push("55" + ddd + "9" + local);
  }
  return variants;
}

// Mensagens do mesmo cliente são tratadas uma de cada vez, na ordem de chegada. Antes, áudio (que demora
// para baixar) e textos enviados logo em seguida eram processados ao mesmo tempo e podiam criar conversas
// duplicadas ou falhar ao criar o contato.
const incomingQueues = new Map<string, Promise<void>>();

export function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const key = brPhoneVariants(msg.from).sort()[0];
  const prev = incomingQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => processIncomingMessage(msg));
  incomingQueues.set(key, next);
  next.catch(() => {}).finally(() => { if (incomingQueues.get(key) === next) incomingQueues.delete(key); });
  return next;
}

async function processIncomingMessage(msg: IncomingMessage): Promise<void> {
  // Normalize phone: WhatsApp webhooks send without "+", but startConversation stores with "+"
  const rawPhone = msg.from;
  const normalizedPhone = rawPhone.replace(/^00/, "+").replace(/^(?!\+)/, "+");

  // Find contact by either format (handles legacy records stored without "+"), com ou sem o nono dígito
  // Prefer older record (has the conversation history)
  const phoneOptions = brPhoneVariants(rawPhone).flatMap((d) => [d, "+" + d]);
  let contact = await prisma.waContact.findFirst({
    where: { phone: { in: phoneOptions } },
    orderBy: { createdAt: "asc" },
  });

  if (contact) {
    // Fix phone format if stored in old format, and update name
    // Nome editado pela equipe (nameLocked) não é sobrescrito pelo nome do perfil do WhatsApp
    const updates: { name?: string; phone?: string } = contact.nameLocked ? {} : { name: msg.name };
    // Só corrige o "+"; se o salvo difere pelo nono dígito, mantém o número que a equipe cadastrou
    if (contact.phone !== normalizedPhone && contact.phone.replace(/\D/g, "") === rawPhone.replace(/\D/g, "")) {
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

  if (!conversation && !msg.phoneNumberId) {
    // Only fall back to any open conversation when the message has no phoneNumberId metadata
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
    savedMediaUrl = await downloadMediaFromMeta(msg.mediaId, msg.mimeType, msg.phoneNumberId);
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

  // Notify all connected clients in real-time via SSE
  broadcastWaMessage({ convId: conversation.id, contactName: contact.name, text: lastText, phoneNumberId: msg.phoneNumberId });

  // Run automations
  await runAutomations(conversation.id, contact.phone, msg.text, msg.phoneNumberId ?? conversation.phoneNumberId);
}

// ─── Automations ──────────────────────────────────────────────────────────────

/** "Olá, BOM dia!!" → "ola bom dia": ignora maiúsculas, acentos, pontuação e espaços extras */
function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Palavras que não precisam aparecer na mensagem ("tabela DE preços" → tabela + preços)
const MATCH_STOPWORDS = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "um", "uma", "em", "no", "na", "pra", "para", "por", "com", "que"]);

/** Plural simples do português: cartoes→cartao, paes→pao, copos→copo, folders→folder */
function singularForMatch(w: string): string {
  if (w.length <= 3) return w;
  return w
    .replace(/oes$|aes$/, "ao")
    .replace(/ais$/, "al")
    .replace(/eis$/, "el")
    .replace(/ns$/, "m")
    .replace(/(?<=[aeiou])s$/, "");
}

/**
 * Modo "Contém": cada palavra da chave aparece na mensagem, em qualquer ordem, aceitando
 * singular/plural, palavra com final a mais ("orcamento" ↔ "orcamentos") e palavra digitada
 * pela metade (mín. 4 letras, "orcam" → "orcamento"). Não pega pedaço no meio ("oi" ≠ "noite").
 */
function containsKeyword(msg: string, kw: string): boolean {
  const msgWords = msg.split(" ").map(singularForMatch);
  let kwWords = kw.split(" ");
  const significant = kwWords.filter((w) => !MATCH_STOPWORDS.has(w));
  if (significant.length) kwWords = significant;
  return kwWords.map(singularForMatch).every((k) =>
    msgWords.some((m) => m.startsWith(k) || (m.length >= 4 && k.startsWith(m)))
  );
}

async function runAutomations(conversationId: string, phone: string, text: string, phoneNumberId?: string | null): Promise<void> {
  // Automações do número que recebeu a mensagem + as gerais (sem número); as do número têm prioridade
  const automations = await prisma.waAutomation.findMany({
    // "all" = automações salvas pela tela com o filtro "todos os números" (bug corrigido) — valem como gerais
    where: { active: true, OR: [{ phoneNumberId: null }, { phoneNumberId: "all" }, ...(phoneNumberId ? [{ phoneNumberId }] : [])] },
    orderBy: { createdAt: "asc" },
  });
  const isGeneral = (p: string | null) => !p || p === "all";
  automations.sort((a, b) => Number(isGeneral(a.phoneNumberId)) - Number(isGeneral(b.phoneNumberId)));
  const msg = normalizeForMatch(text);
  if (!msg) return;

  for (const auto of automations) {
    // Várias palavras-chave separadas por vírgula: basta uma bater
    const keywords = auto.keyword.split(",").map(normalizeForMatch).filter(Boolean);
    const matches = keywords.some((kw) =>
      auto.matchType === "exact"
        ? msg === kw
        : auto.matchType === "starts_with"
          ? msg.startsWith(kw)
          : containsKeyword(msg, kw)
    );

    if (!matches) continue;

    try {
      // Responde pelo mesmo número que recebeu a mensagem (antes saía sempre pelo número principal)
      const waId = await sendTextToMeta(phone, auto.response, undefined, phoneNumberId ?? undefined);
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

/**
 * "43 99999-8888" → "+5543999998888". Número digitado sem DDI é do Brasil — antes virava "+43…"
 * (código de outro país): a Meta recusava e ficava um contato duplicado com o número errado.
 */
export function normalizeOutboundPhone(phone: string): string {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return "+" + digits;
  if (raw.startsWith("00")) return "+" + digits.slice(2);
  const local = digits.replace(/^0+/, ""); // "043 9…" (com zero de operadora)
  if (local.length === 10 || local.length === 11) return "+55" + local;
  return "+" + digits;
}

/** Contato que já existe com o mesmo celular (com ou sem "+", com ou sem o nono dígito) */
async function findOutboundContact(normalized: string) {
  return prisma.waContact.findFirst({
    where: { phone: { in: brPhoneVariants(normalized).flatMap((d) => [d, "+" + d]) } },
    orderBy: { createdAt: "asc" },
  });
}

/** Contato já existente com o mesmo celular (com ou sem o nono dígito), senão cria — evita conversa duplicada */
async function findOrCreateOutboundContact(normalized: string, name: string) {
  return (await findOutboundContact(normalized)) ?? prisma.waContact.create({ data: { phone: normalized, name: name || normalized } });
}

/**
 * Conversa do contato neste número; se não houver, aproveita uma "sem número" (dá o número a ela);
 * só cria uma nova quando não existe nenhuma das duas. Reabre se estiver encerrada.
 */
async function pickOutboundConversation(contactId: string, phoneNumberId?: string | null) {
  let conversation = await prisma.waConversation.findFirst({
    where: { contactId, ...(phoneNumberId ? { phoneNumberId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation && phoneNumberId) {
    const unassigned = await prisma.waConversation.findFirst({ where: { contactId, phoneNumberId: null }, orderBy: { updatedAt: "desc" } });
    if (unassigned) conversation = await prisma.waConversation.update({ where: { id: unassigned.id }, data: { phoneNumberId } });
  }
  if (!conversation) {
    return prisma.waConversation.create({ data: { contactId, phoneNumberId: phoneNumberId ?? null } });
  }
  if (conversation.status === "closed") {
    return prisma.waConversation.update({ where: { id: conversation.id }, data: { status: "open" } });
  }
  return conversation;
}

export async function startConversation(phone: string, name: string, text: string, sentById: string, explicitPhoneNumberId?: string) {
  const normalized = normalizeOutboundPhone(phone);

  // Priority: explicit phoneNumberId from request > user's configured number > default
  const sender = await prisma.user.findUnique({ where: { id: sentById }, select: { waPhoneNumberId: true } });
  const phoneNumberId = explicitPhoneNumberId ?? sender?.waPhoneNumberId ?? undefined;

  // Envia primeiro: se a Meta recusar, não fica contato/conversa criados à toa
  const existing = await findOutboundContact(normalized);
  const waId = await sendTextToMeta(existing?.phone ?? normalized, text, undefined, phoneNumberId);
  const contact = existing ?? await findOrCreateOutboundContact(normalized, name);
  const conversation = await pickOutboundConversation(contact.id, phoneNumberId);

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

export async function listConversations(status?: string, filterPhoneNumberId?: string) {
  return prisma.waConversation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(filterPhoneNumberId ? { phoneNumberId: filterPhoneNumberId } : {}),
    },
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

/**
 * Mostra "digitando…" no celular do cliente por até 25 s ou até a próxima mensagem.
 * A Meta só aceita o aviso junto com a confirmação de leitura da última mensagem do cliente (✓✓ azul).
 */
export async function sendTypingIndicator(conversationId: string): Promise<void> {
  const last = await prisma.waMessage.findFirst({
    where: { conversationId, direction: "inbound", waMessageId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { waMessageId: true, conversation: { select: { phoneNumberId: true } } },
  });
  if (!last?.waMessageId) return;
  const cfg = await getPhoneConfig(last.conversation.phoneNumberId);
  await metaPost(`${GRAPH_URL}/${cfg.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: last.waMessageId,
    typing_indicator: { type: "text" },
  }, cfg.accessToken, 1);
}

/** Zera as não lidas de todas as conversas (de um número, quando informado). Só local — não envia nada ao cliente. */
export async function markAllConversationsRead(phoneNumberId?: string) {
  const result = await prisma.waConversation.updateMany({
    where: {
      unreadCount: { gt: 0 },
      // Mesma regra da lista: conversas sem número definido aparecem em todos os números
      ...(phoneNumberId ? { OR: [{ phoneNumberId }, { phoneNumberId: null }] } : {}),
    },
    data: { unreadCount: 0 },
  });
  return result.count;
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
  isInternal?: boolean,
  forwarded?: boolean
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
    data: { conversationId, direction: "outbound", text, waMessageId: waId || undefined, status: "sent", sentById, replyToId: replyToId ?? null, forwarded: forwarded ?? false },
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

export async function starMessage(id: string, starred: boolean) {
  return prisma.waMessage.update({
    where: { id },
    data: { starred },
    include: {
      sentBy: { select: { id: true, name: true, avatarUrl: true } },
      replyTo: { include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
}

export async function getLinkPreview(url: string): Promise<{ title: string; description: string; image: string; domain: string } | null> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)" },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timeout));
    const html = await res.text();
    const getOg = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*)["']`, "i")) ||
                html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${prop}["']`, "i"));
      return m?.[1]?.trim() ?? "";
    };
    const title = getOg("title") || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const description = getOg("description");
    const image = getOg("image");
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return { title: title.slice(0, 200), description: description.slice(0, 300), image: image.slice(0, 500), domain };
  } catch {
    return null;
  }
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function listContacts() {
  return prisma.waContact.findMany({ orderBy: { name: "asc" } });
}

export async function updateContact(id: string, data: { name?: string; notes?: string; crmContactId?: string | null }) {
  // Se a equipe mudou o nome, trava para o nome do perfil do WhatsApp não voltar na próxima mensagem
  const current = await prisma.waContact.findUnique({ where: { id }, select: { name: true } });
  const renamed = data.name !== undefined && data.name.trim() !== "" && data.name.trim() !== current?.name;
  return prisma.waContact.update({
    where: { id },
    data: { ...data, ...(data.name !== undefined ? { name: data.name.trim() || current?.name } : {}), ...(renamed ? { nameLocked: true } : {}) },
  });
}

// ─── Labels ───────────────────────────────────────────────────────────────────

/** Sem número: todas. Com número: as gerais + as daquele número. */
export function listLabels(phoneNumberId?: string) {
  return prisma.waLabel.findMany({
    where: phoneNumberId ? { OR: [{ phoneNumberId: null }, { phoneNumberId: "all" }, { phoneNumberId }] } : undefined,
    orderBy: { name: "asc" },
  });
}

export function getLabel(id: string) {
  return prisma.waLabel.findUnique({ where: { id } });
}

/** Já existe etiqueta com esse nome no mesmo número (ou geral)? */
export function findLabelByName(name: string, phoneNumberId: string | null) {
  return prisma.waLabel.findFirst({ where: { name, phoneNumberId } });
}

export function createLabel(name: string, color: string, phoneNumberId: string | null = null) {
  return prisma.waLabel.create({ data: { name, color, phoneNumberId } });
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

/** Sem filtro: todas. Com número: as gerais + as daquele número. */
export async function listAutomations(phoneNumberId?: string) {
  return prisma.waAutomation.findMany({
    where: phoneNumberId ? { OR: [{ phoneNumberId: null }, { phoneNumberId: "all" }, { phoneNumberId }] } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export function getAutomation(id: string) {
  return prisma.waAutomation.findUnique({ where: { id } });
}

export async function createAutomation(data: {
  name: string;
  keyword: string;
  matchType?: string;
  response: string;
  active?: boolean;
  phoneNumberId?: string | null;
}) {
  return prisma.waAutomation.create({ data });
}

export async function updateAutomation(
  id: string,
  data: { name?: string; keyword?: string; matchType?: string; response?: string; active?: boolean; phoneNumberId?: string | null }
) {
  return prisma.waAutomation.update({ where: { id }, data });
}

export async function deleteAutomation(id: string) {
  return prisma.waAutomation.delete({ where: { id } });
}

// ─── Meta Message Templates ───────────────────────────────────────────────────

/** Templates da conta (WABA) do número informado; sem número = conta principal */
export async function listMetaTemplates(phoneNumberId?: string | null) {
  const { wabaId, accessToken } = await getWabaConfig(phoneNumberId);
  const url = `${GRAPH_URL}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=50`;
  const res = await metaHttp.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(e => { throw new Error(`WhatsApp API error: ${e.message}`); });
  return (res.data as { data: unknown[] }).data ?? [];
}

export async function createMetaTemplate(payload: {
  name: string;
  category: string;
  language: string;
  bodyText: string;
  exampleValues?: string[];
}, phoneNumberId?: string | null) {
  const { wabaId, accessToken } = await getWabaConfig(phoneNumberId);

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
  return await metaPost(url, body, accessToken);
}

/** Erro da Meta → mensagem que o vendedor entende (o detalhe técnico fica no log do servidor) */
function friendlyTemplateError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  let code: number | undefined, details = "";
  try {
    const body = JSON.parse(raw.slice(raw.indexOf("{"))) as { error?: { code?: number; message?: string; error_data?: { details?: string } } };
    code = body.error?.code;
    details = body.error?.error_data?.details ?? body.error?.message ?? "";
  } catch { /* não era um erro da API */ }
  const known: Record<number, string> = {
    132000: "A quantidade de variáveis não bate com o template. Preencha todos os campos.",
    132001: "Este template não existe (ou ainda não foi aprovado) na conta deste número.",
    132005: "O texto ficou longo demais depois de preencher as variáveis.",
    132007: "O texto das variáveis não é aceito pela Meta (evite links e quebras de linha).",
    132012: "Algum campo do template está no formato errado (ex.: falta a imagem do cabeçalho).",
    132015: "Este template foi pausado pela Meta por baixa qualidade.",
    132016: "Este template foi desativado pela Meta.",
    131008: "Falta preencher um campo obrigatório do template.",
    131026: "Este número não tem WhatsApp ou não pode receber mensagens.",
    131030: "Este número não está liberado para receber mensagens desta conta (conta em modo de teste).",
    131049: "A Meta segurou a mensagem para não cansar o cliente (muitas mensagens de marketing). Tente mais tarde ou use um template de utilidade.",
    131056: "Muitas mensagens para este número em pouco tempo. Aguarde um pouco.",
    100: "A Meta recusou algum dado do envio" + (details ? `: ${details}` : "."),
  };
  if (code && known[code]) return new Error(known[code]);
  return new Error(details ? `A Meta recusou o envio: ${details}` : "Não foi possível enviar o template. Tente de novo.");
}

export interface TemplateParams {
  /** Valores de {{1}}, {{2}}... do corpo, na ordem */
  variables: string[];
  /** Valores de {{1}}... do cabeçalho de texto */
  headerVariables?: string[];
  /** Complemento do link de cada botão com link variável, pelo índice do botão */
  buttonVariables?: { index: number; value: string }[];
  headerMediaUrl?: string;
  headerMediaType?: string;
  headerFileName?: string;
}

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  language: string,
  params: TemplateParams,
  phoneNumberId?: string | null,
): Promise<string> {
  const cfg = await getPhoneConfig(phoneNumberId);
  const url = `${GRAPH_URL}/${cfg.phoneNumberId}/messages`;

  const components: object[] = [];

  // Cabeçalho: mídia (prefere o id já enviado à Meta) ou texto com variáveis
  if (params.headerMediaType && params.headerMediaUrl) {
    const mediaKey = params.headerMediaType.toLowerCase();
    const isId = /^\d{10,}$/.test(params.headerMediaUrl);
    const mediaObj: Record<string, unknown> = isId ? { id: params.headerMediaUrl } : { link: params.headerMediaUrl };
    if (mediaKey === "document" && params.headerFileName) mediaObj.filename = params.headerFileName;
    components.push({ type: "header", parameters: [{ type: mediaKey, [mediaKey]: mediaObj }] });
  } else if (params.headerVariables?.length) {
    components.push({ type: "header", parameters: params.headerVariables.map((v) => ({ type: "text", text: v })) });
  }

  if (params.variables.length) {
    components.push({ type: "body", parameters: params.variables.map((v) => ({ type: "text", text: v })) });
  }

  for (const b of params.buttonVariables ?? []) {
    components.push({ type: "button", sub_type: "url", index: String(b.index), parameters: [{ type: "text", text: b.value }] });
  }

  try {
    const data = await metaPost(url, {
      messaging_product: "whatsapp",
      to: phone.replace(/^\+/, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        ...(components.length ? { components } : {}),
      },
    }, cfg.accessToken) as { messages?: { id: string }[] };
    return data.messages?.[0]?.id ?? "";
  } catch (err) {
    console.error(`[WhatsApp] Template "${templateName}" recusado:`, err instanceof Error ? err.message : err);
    throw friendlyTemplateError(err);
  }
}

export async function startConversationWithTemplate(input: {
  /** Envio de dentro de um chat: usa o contato e o número desta conversa */
  conversationId?: string;
  phone?: string;
  name?: string;
  templateName: string;
  language: string;
  params: TemplateParams;
  /** Texto final (com as variáveis) para aparecer no chat da plataforma */
  previewText?: string;
  sentById: string;
  phoneNumberId?: string;
}) {
  const sender = await prisma.user.findUnique({ where: { id: input.sentById }, select: { waPhoneNumberId: true } });

  let conversation = input.conversationId
    ? await prisma.waConversation.findUnique({ where: { id: input.conversationId }, include: { contact: true } })
    : null;
  if (input.conversationId && !conversation) throw new Error("Conversa não encontrada.");

  const phoneNumberId = conversation?.phoneNumberId ?? input.phoneNumberId ?? sender?.waPhoneNumberId ?? undefined;
  const normalized = conversation ? conversation.contact.phone : normalizeOutboundPhone(input.phone ?? "");
  if (normalized.replace(/\D/g, "").length < 10) throw new Error("Número inválido. Use DDD + número (ex.: 43 99999-8888).");
  const existing = conversation ? conversation.contact : await findOutboundContact(normalized);

  // Envia primeiro: se a Meta recusar, não fica contato nem conversa criados à toa (era o "número duplicado")
  const waId = await sendTemplateMessage(existing?.phone ?? normalized, input.templateName, input.language, input.params, phoneNumberId);

  if (!conversation) {
    const contact = existing ?? await findOrCreateOutboundContact(normalized, input.name?.trim() || normalized);
    conversation = { ...(await pickOutboundConversation(contact.id, phoneNumberId)), contact };
  } else if (conversation.status === "closed") {
    conversation = { ...(await prisma.waConversation.update({ where: { id: conversation.id }, data: { status: "open" } })), contact: conversation.contact };
  }

  const vars = [...(input.params.headerVariables ?? []), ...input.params.variables];
  const bodyText = input.previewText?.trim()
    || (vars.length ? `[Template: ${input.templateName}] ${vars.join(", ")}` : `[Template: ${input.templateName}]`);

  const message = await prisma.waMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      text: bodyText,
      waMessageId: waId || undefined,
      status: "sent",
      sentById: input.sentById,
    },
    include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await prisma.waConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessageText: bodyText },
  });

  const { contact: _c, ...conv } = conversation;
  return { conversation: conv, message };
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
  filename: string,
  phoneNumberId?: string | null
): Promise<{ mediaId: string; localFilename: string }> {
  // Sobe a mídia pelo mesmo número que vai enviar (antes ia sempre pelo principal)
  const cfg = await getPhoneConfig(phoneNumberId);
  const url = `${GRAPH_URL}/${cfg.phoneNumberId}/media`;

  // A Meta recusa parâmetros no tipo ("audio/ogg; codecs=opus" → "audio/ogg")
  mimetype = mimetype.split(";")[0].trim();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimetype);
  form.append("file", new Blob([buffer], { type: mimetype }), filename);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
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
  localFilename: string | null,
  originalFilename: string | null = null
) {
  const conv = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { contact: true },
  });

  const isImage = mimetype.startsWith("image/");
  const isVideo = mimetype.startsWith("video/");
  const isAudio = mimetype.startsWith("audio/");
  const mediaType = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "document";

  const mediaObj: Record<string, unknown> = { id: mediaId };
  if (caption) mediaObj.caption = caption;
  if (mediaType === "document" && originalFilename) mediaObj.filename = originalFilename;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: conv.contact.phone.replace(/^\+/, ""),
    type: mediaType,
    [mediaType]: mediaObj,
  };

  const cfg = await getPhoneConfig(conv.phoneNumberId);
  const url = `${GRAPH_URL}/${cfg.phoneNumberId}/messages`;
  const result = await metaPost(url, body, cfg.accessToken) as { messages?: { id: string }[] };
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
      filename: originalFilename,
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

// ─── Phone numbers ────────────────────────────────────────────────────────────

export function listPhoneNumbers() {
  return prisma.waPhoneNumber.findMany({ orderBy: { createdAt: "asc" } });
}

export function createPhoneNumber(data: { phoneNumberId: string; displayName: string; phone?: string; accessToken?: string; wabaId?: string }) {
  return prisma.waPhoneNumber.create({ data });
}

export function updatePhoneNumber(id: string, data: { displayName?: string; phone?: string; accessToken?: string; active?: boolean; wabaId?: string | null }) {
  return prisma.waPhoneNumber.update({ where: { id }, data });
}

export function deletePhoneNumber(id: string) {
  return prisma.waPhoneNumber.delete({ where: { id } });
}

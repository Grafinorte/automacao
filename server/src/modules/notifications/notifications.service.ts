import type { Response } from "express";
import { prisma } from "../../db/prisma";

// ── In-memory SSE client registry ────────────────────────────────────────────
const sseClients = new Map<string, Set<Response>>();

export function addSseClient(userId: string, res: Response) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);
}

export function removeSseClient(userId: string, res: Response) {
  sseClients.get(userId)?.delete(res);
}

export function getOnlineUserIds(): string[] {
  const ids: string[] = [];
  for (const [uid, clients] of sseClients.entries()) {
    if (clients.size > 0) ids.push(uid);
  }
  return ids;
}

function pushToUser(userId: string, data: object) {
  const clients = sseClients.get(userId);
  if (!clients?.size) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string
) {
  const notif = await prisma.notification.create({
    data: { userId, type, title, body: body ?? null, link: link ?? null },
  });
  pushToUser(userId, { event: "notification", data: notif });
  return notif;
}

export function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
}

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

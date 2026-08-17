import type { Request, Response } from "express";
import * as svc from "./notifications.service";

export function streamNotifications(req: Request, res: Response) {
  const userId = req.user!.sub as string;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send a heartbeat immediately so the client knows the connection is live
  res.write(": ping\n\n");

  svc.addSseClient(userId, res);

  // Heartbeat every 25s to keep connection alive through proxies
  const hb = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(hb); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    svc.removeSseClient(userId, res);
  });
}

export async function getNotifications(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const items = await svc.listNotifications(userId);
  res.json(items);
}

export async function getUnreadCount(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const count = await svc.countUnread(userId);
  res.json({ count });
}

export async function patchRead(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  await svc.markRead(req.params.id, userId);
  res.json({ ok: true });
}

export async function postMarkAllRead(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  await svc.markAllRead(userId);
  res.json({ ok: true });
}

export function getOnlineUsers(_req: Request, res: Response) {
  res.json({ onlineUserIds: svc.getOnlineUserIds() });
}

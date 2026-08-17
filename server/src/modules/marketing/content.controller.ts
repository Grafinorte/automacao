import type { Request, Response } from "express";
import * as contentService from "./content.service";

export async function getBoard(_req: Request, res: Response) {
  res.json(await contentService.listBoard());
}

export async function getContentItemById(req: Request, res: Response) {
  res.json(await contentService.getContentItem(req.params.id));
}

export async function postContentItem(req: Request, res: Response) {
  const { title, type, channel, status, scheduledDate, notes, campaignId, assigneeId } = req.body ?? {};
  if (!title || !type || !channel) {
    res.status(400).json({ error: "title, type e channel são obrigatórios" });
    return;
  }
  const item = await contentService.createContentItem({
    title,
    type,
    channel,
    status,
    scheduledDate,
    notes,
    campaignId,
    assigneeId,
    createdById: req.user!.sub,
  });
  res.status(201).json(item);
}

export async function patchContentItem(req: Request, res: Response) {
  const { title, type, channel, scheduledDate, notes, campaignId, assigneeId } = req.body ?? {};
  const item = await contentService.updateContentItem(req.params.id, {
    title,
    type,
    channel,
    scheduledDate,
    notes,
    campaignId,
    assigneeId,
  });
  res.json(item);
}

export async function deleteContentItem(req: Request, res: Response) {
  await contentService.deleteContentItem(req.params.id);
  res.status(204).send();
}

export async function moveContentItem(req: Request, res: Response) {
  const { toStatus, toIndex } = req.body ?? {};
  if (!toStatus || typeof toIndex !== "number") {
    res.status(400).json({ error: "toStatus e toIndex são obrigatórios" });
    return;
  }
  await contentService.moveContentItem(req.params.id, toStatus, toIndex);
  res.status(204).send();
}

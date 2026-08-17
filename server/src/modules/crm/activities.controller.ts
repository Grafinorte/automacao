import type { Request, Response } from "express";
import * as activitiesService from "./activities.service";

export async function postActivity(req: Request, res: Response) {
  const { body } = req.body ?? {};
  if (!body?.trim()) {
    res.status(400).json({ error: "Mensagem é obrigatória" });
    return;
  }
  const activity = await activitiesService.addActivity(req.params.dealId, req.user!.sub, body.trim());
  res.status(201).json(activity);
}

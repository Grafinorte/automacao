import type { Request, Response } from "express";
import * as campaignsService from "./campaigns.service";

export async function getCampaigns(_req: Request, res: Response) {
  res.json(await campaignsService.listCampaigns());
}

export async function getCampaignById(req: Request, res: Response) {
  res.json(await campaignsService.getCampaign(req.params.id));
}

export async function postCampaign(req: Request, res: Response) {
  const { name, objective, channel, status, startDate, endDate, budget, notes, ownerId } = req.body ?? {};
  if (!name || !channel) {
    res.status(400).json({ error: "name e channel são obrigatórios" });
    return;
  }
  const campaign = await campaignsService.createCampaign({
    name,
    objective,
    channel,
    status,
    startDate,
    endDate,
    budget,
    notes,
    ownerId: ownerId || req.user!.sub,
    createdById: req.user!.sub,
  });
  res.status(201).json(campaign);
}

export async function patchCampaign(req: Request, res: Response) {
  const { name, objective, channel, status, startDate, endDate, budget, notes, ownerId } = req.body ?? {};
  const campaign = await campaignsService.updateCampaign(req.params.id, {
    name,
    objective,
    channel,
    status,
    startDate,
    endDate,
    budget,
    notes,
    ownerId,
  });
  res.json(campaign);
}

export async function deleteCampaign(req: Request, res: Response) {
  await campaignsService.deleteCampaign(req.params.id);
  res.status(204).send();
}

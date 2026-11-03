import type { Request, Response } from "express";
import * as service from "./colorProof.service";
import { readPanelPhotos } from "./colorProof.ai";

export async function postReadPhotos(req: Request, res: Response) {
  res.json(await readPanelPhotos(req.body?.images));
}

export async function getProofs(req: Request, res: Response) {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  res.json(await service.listProofs(from && !isNaN(from.getTime()) ? from : undefined, to && !isNaN(to.getTime()) ? to : undefined));
}

export async function postProof(req: Request, res: Response) {
  res.status(201).json(await service.createProof(req.body ?? {}, req.user!.sub));
}

export async function putProof(req: Request, res: Response) {
  res.json(await service.updateProof(req.params.id, req.body ?? {}));
}

export async function deleteProof(req: Request, res: Response) {
  await service.deleteProof(req.params.id);
  res.status(204).end();
}

export async function getSettings(_req: Request, res: Response) {
  res.json(await service.getSettings());
}

export async function putSettings(req: Request, res: Response) {
  const { cartridgePrice, cartridgeMl, paperPricePerM2, maintenancePct } = req.body ?? {};
  res.json(await service.updateSettings({
    cartridgePrice: Number(cartridgePrice),
    cartridgeMl: Number(cartridgeMl),
    paperPricePerM2: Number(paperPricePerM2),
    maintenancePct: Number(maintenancePct),
  }));
}

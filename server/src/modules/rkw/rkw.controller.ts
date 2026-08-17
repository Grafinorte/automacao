import type { Request, Response } from "express";
import * as rkwService from "./rkw.service";

export async function getRkwData(_req: Request, res: Response) {
  const data = await rkwService.getRkwData();
  res.json(data);
}

export async function patchParameter(req: Request, res: Response) {
  const { key } = req.params;
  const { value } = req.body;
  if (typeof value !== "number") {
    res.status(400).json({ message: "value deve ser número" });
    return;
  }
  const updated = await rkwService.updateParameter(key, value);
  res.json(updated);
}

export async function patchMachineRate(req: Request, res: Response) {
  const { id } = req.params;
  const { rateConsolidated, bufferPct, status } = req.body;
  const updated = await rkwService.updateMachineRate(id, { rateConsolidated, bufferPct, status });
  res.json(updated);
}

export async function patchFixedCost(req: Request, res: Response) {
  const { id } = req.params;
  const { amount } = req.body;
  if (typeof amount !== "number") {
    res.status(400).json({ message: "amount deve ser número" });
    return;
  }
  const updated = await rkwService.updateFixedCost(id, amount);
  res.json(updated);
}

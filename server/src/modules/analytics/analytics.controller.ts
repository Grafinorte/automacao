import type { Request, Response } from "express";
import * as analyticsService from "./analytics.service";

const ALLOWED_DAYS = [7, 30, 90];

export async function getSites(_req: Request, res: Response) {
  res.json(analyticsService.listSites());
}

export async function getSiteReport(req: Request, res: Response) {
  const days = Number(req.query.days) || 30;
  if (!ALLOWED_DAYS.includes(days)) {
    res.status(400).json({ error: "Período inválido (use 7, 30 ou 90 dias)" });
    return;
  }
  res.json(await analyticsService.getSiteReport(req.params.site, days));
}

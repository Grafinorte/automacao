import type { Request, Response } from "express";
import * as svc from "./competitor.service";

export async function getProfiles(_req: Request, res: Response) {
  res.json(await svc.listProfiles());
}

export async function postProfile(req: Request, res: Response) {
  const { handle, name, niche } = req.body as { handle?: string; name?: string; niche?: string };
  if (!handle || !niche) { res.status(400).json({ error: "handle e niche obrigatórios" }); return; }
  res.status(201).json(await svc.addProfile(handle.replace("@", ""), name ?? handle, niche));
}

export async function deleteProfile(req: Request, res: Response) {
  await svc.removeProfile(req.params.id);
  res.json({ ok: true });
}

export async function getReport(req: Request, res: Response) {
  const report = await svc.getLatestReport(req.params.id);
  if (!report) { res.status(404).json({ error: "Nenhuma análise encontrada" }); return; }
  res.json({ ...report, analysis: JSON.parse(report.analysis) });
}

export async function getHistory(req: Request, res: Response) {
  const reports = await svc.getReportHistory(req.params.id);
  res.json(reports.map(r => ({ ...r, analysis: JSON.parse(r.analysis) })));
}

export async function triggerAnalysis(req: Request, res: Response) {
  const { id } = req.params;
  // Run async - don't block response
  svc.runAnalysisForProfile(id).catch(err =>
    console.error(`[Competitor] Erro ao analisar perfil ${id}:`, err)
  );
  res.json({ ok: true, message: "Análise iniciada — atualiza em ~30s" });
}

import type { Request, Response } from "express";
import * as prospectingService from "./prospecting.service";

// O custo das buscas (saldo do treg) só aparece para o admin
function hideCost<T extends { costMicro?: number }>(req: Request, item: T): T {
  if (req.user!.role === "ADMIN") return item;
  const { costMicro: _omit, ...rest } = item;
  return rest as T;
}

export async function postSearch(req: Request, res: Response) {
  const { segmento, regiao, company } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof segmento !== "string" || !segmento.trim()) {
    res.status(400).json({ error: "Informe o segmento (ex.: sorveteria, escola, editora)" });
    return;
  }
  if (typeof regiao !== "string" || !regiao.trim()) {
    res.status(400).json({ error: "Informe a cidade ou região" });
    return;
  }
  const search = await prospectingService.runSearch(
    {
      segmento: segmento.trim().slice(0, 120),
      regiao: regiao.trim().slice(0, 120),
      company: company === "PLUSPACK" ? "PLUSPACK" : "GRAFINORTE",
    },
    req.user!.sub
  );
  res.status(201).json(hideCost(req, search));
}

export async function getSearches(req: Request, res: Response) {
  const mine = req.query.mine === "1";
  const searches = await prospectingService.listSearches({ userId: mine ? req.user!.sub : undefined });
  res.json(searches.map((s) => hideCost(req, s)));
}

export async function getSearch(req: Request, res: Response) {
  const search = await prospectingService.getSearch(req.params.id as string);
  res.json(hideCost(req, search));
}

export async function postAddLead(req: Request, res: Response) {
  const result = await prospectingService.addLeadToCrm(req.params.id as string, req.user!.sub);
  res.status(201).json(result);
}

export async function patchLead(req: Request, res: Response) {
  const { status } = (req.body ?? {}) as { status?: string };
  if (status !== "NOVO" && status !== "DESCARTADO") {
    res.status(400).json({ error: "Status inválido" });
    return;
  }
  res.json(await prospectingService.setLeadStatus(req.params.id as string, status));
}

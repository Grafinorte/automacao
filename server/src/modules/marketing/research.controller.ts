import type { Request, Response } from "express";
import * as researchService from "./research.service";
import type { ResearchKind } from "./research.service";

const KINDS: ResearchKind[] = ["ADS_ADVERTISER", "ADS_KEYWORD", "KEYWORDS"];

/** Custo do treg só aparece para administrador */
function hideCost<T extends { costMicro?: number }>(req: Request, item: T): T {
  if (req.user!.role === "ADMIN") return item;
  const { costMicro: _omit, ...rest } = item;
  return rest as T;
}

export async function postResearch(req: Request, res: Response) {
  const { kind, query } = req.body as { kind?: ResearchKind; query?: string };
  if (!kind || !KINDS.includes(kind) || typeof query !== "string") {
    res.status(400).json({ error: "Pesquisa inválida." });
    return;
  }
  res.status(201).json(hideCost(req, await researchService.runResearch(kind, query, req.user!.sub)));
}

export async function getResearchList(req: Request, res: Response) {
  // ?group=ads (anúncios, por empresa e por palavra) ou ?group=keywords
  const kinds: ResearchKind[] = req.query.group === "keywords" ? ["KEYWORDS"] : ["ADS_ADVERTISER", "ADS_KEYWORD"];
  res.json((await researchService.listResearch(kinds)).map((r) => hideCost(req, r)));
}

export async function getResearchById(req: Request, res: Response) {
  res.json(hideCost(req, await researchService.getResearch(req.params.id)));
}

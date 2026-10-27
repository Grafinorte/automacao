import { api } from "./client";

export type ResearchKind = "ADS_ADVERTISER" | "ADS_KEYWORD" | "KEYWORDS";

export interface CompetitorAd {
  id: string;
  url: string;
  pageName: string;
  pageUrl: string | null;
  pageLikes: number | null;
  body: string;
  title: string | null;
  cta: string | null;
  linkUrl: string | null;
  linkCaption: string | null;
  format: string;
  images: string[];
  video: string | null;
  platforms: string[];
  startDate: string | null;
  isActive: boolean;
}

export interface KeywordRow {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  trend: { month: string; volume: number }[];
  isSeed: boolean;
}

export interface ResearchSummary {
  id: string;
  kind: ResearchKind;
  query: string;
  itemCount: number;
  /** Só chega para administrador */
  costMicro?: number;
  createdAt: string;
  userName: string;
}

export interface Research<R> extends ResearchSummary {
  /** true quando a mesma pesquisa já tinha sido feita hoje (veio do histórico, sem custo) */
  cached: boolean;
  result: R;
}

export type AdsResearch = Research<{ ads: CompetitorAd[] }>;
export type KeywordsResearch = Research<{ rows: KeywordRow[] }>;

export const researchApi = {
  run: <R>(kind: ResearchKind, query: string) => api.post<Research<R>>("/marketing/research", { kind, query }),
  list: (group: "ads" | "keywords") => api.get<ResearchSummary[]>(`/marketing/research?group=${group}`),
  get: <R>(id: string) => api.get<Research<R>>(`/marketing/research/${id}`),
};

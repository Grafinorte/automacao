import { api } from "./client";

export interface GaSite {
  key: string;
  label: string;
  /** Empresa (Grafinorte, Pluspack) — agrupa site principal e LPs */
  group: string;
  configured: boolean;
}

export interface GaTotals {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  engagementRate: number;
  averageSessionDuration: number;
  keyEvents: number;
}

export interface GaReport {
  site: string;
  label: string;
  days: number;
  updatedAt: string;
  /** Visão somada ("Todas as LPs"): nomes dos sites que entraram na soma */
  combinedOf?: string[];
  totals: { current: GaTotals; previous: GaTotals };
  daily: { date: string; users: number; sessions: number }[];
  channels: { name: string; sessions: number }[];
  pages: { path: string; title: string; views: number; users: number; siteLabel?: string }[];
  sources: { name: string; sessions: number }[];
  devices: { name: string; users: number }[];
  cities: { name: string; users: number }[];
}

export const analyticsApi = {
  sites: () => api.get<GaSite[]>("/marketing/analytics/sites"),
  report: (site: string, days: number) => api.get<GaReport>(`/marketing/analytics/${site}?days=${days}`),
};

import crypto from "node:crypto";
import fs from "node:fs";
import { env, type GaSiteConfig } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

// Google Analytics 4 — Data API (somente leitura), autenticada por conta de serviço via JWT

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount | null {
  try {
    const raw = env.gaServiceAccountJson || (env.gaServiceAccountFile ? fs.readFileSync(env.gaServiceAccountFile, "utf8") : "");
    if (!raw) return null;
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    return sa.client_email && sa.private_key ? (sa as ServiceAccount) : null;
  } catch {
    return null;
  }
}

export function listSites() {
  const hasCredentials = !!loadServiceAccount();
  const hasProperty = (key: string) => !!env.gaSites.find((s) => s.key === key)?.propertyId;
  return env.gaSites.map((s) => ({
    key: s.key, label: s.label, group: s.group,
    configured: hasCredentials && (s.combine ? s.combine.some(hasProperty) : !!s.propertyId),
  }));
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new HttpError(502, `O Google recusou a credencial do Analytics: ${json.error_description || json.error || res.status}`);
  }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

type DateRange = { startDate: string; endDate: string };
interface ReportRequest {
  dateRanges: DateRange[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  orderBys?: object[];
  limit?: number;
  dimensionFilter?: object;
}
interface ReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
}

async function batchRunReports(propertyId: string, requests: ReportRequest[], hostname?: string): Promise<ReportResponse[]> {
  const sa = loadServiceAccount();
  if (!sa) throw new HttpError(503, "Google Analytics não configurado no servidor.");
  const token = await getAccessToken(sa);
  // LPs que dividem a mesma propriedade: cada uma é separada pelo domínio
  const filtered = hostname
    ? requests.map((r) => ({ ...r, dimensionFilter: { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: hostname } } } }))
    : requests;
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: filtered }),
  });
  const json = (await res.json()) as { reports?: ReportResponse[]; error?: { message: string } };
  if (!res.ok) {
    throw new HttpError(502, `Erro do Google Analytics: ${json.error?.message ?? res.status}`);
  }
  return json.reports ?? [];
}

/** Linhas do relatório como objetos { dimensão: valor, métrica: número } */
function rowsOf(report: ReportResponse): Record<string, string | number>[] {
  const dims = report.dimensionHeaders?.map((h) => h.name) ?? [];
  const mets = report.metricHeaders?.map((h) => h.name) ?? [];
  return (report.rows ?? []).map((r) => {
    const o: Record<string, string | number> = {};
    dims.forEach((d, i) => (o[d] = r.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((m, i) => (o[m] = Number(r.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}

const TOTAL_METRICS = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration", "keyEvents"];

type Totals = Record<string, number>;
export interface SiteReport {
  site: string;
  label: string;
  group: string;
  days: number;
  updatedAt: string;
  /** Visão somada: sites que entraram na soma */
  combinedOf?: string[];
  totals: { current: Totals; previous: Totals };
  daily: { date: string; users: number; sessions: number }[];
  channels: { name: string; sessions: number }[];
  pages: { path: string; title: string; views: number; users: number; siteLabel?: string }[];
  sources: { name: string; sessions: number }[];
  devices: { name: string; users: number }[];
  cities: { name: string; users: number }[];
}

const cache = new Map<string, { at: number; data: SiteReport }>();
const CACHE_MS = 10 * 60 * 1000;

/** Soma listas { name, valor } de vários sites e devolve as maiores */
function mergeBy<T extends { name: string }>(lists: T[][], field: keyof T, limit = 10): T[] {
  const acc = new Map<string, T>();
  for (const row of lists.flat()) {
    const prev = acc.get(row.name);
    acc.set(row.name, prev ? { ...prev, [field]: Number(prev[field]) + Number(row[field]) } : { ...row });
  }
  return [...acc.values()].sort((a, b) => Number(b[field]) - Number(a[field])).slice(0, limit);
}

/** Totais somados; taxa de engajamento e tempo médio ponderados pelas sessões */
function mergeTotals(list: Totals[]): Totals {
  const sum = (k: string) => list.reduce((s, t) => s + (t[k] ?? 0), 0);
  const sessions = sum("sessions");
  const weighted = (k: string) => (sessions ? list.reduce((s, t) => s + (t[k] ?? 0) * (t.sessions ?? 0), 0) / sessions : 0);
  return {
    activeUsers: sum("activeUsers"), newUsers: sum("newUsers"), sessions, screenPageViews: sum("screenPageViews"),
    keyEvents: sum("keyEvents"), engagementRate: weighted("engagementRate"), averageSessionDuration: weighted("averageSessionDuration"),
  };
}

async function getCombinedReport(site: GaSiteConfig, days: number): Promise<SiteReport> {
  const parts = env.gaSites.filter((s) => site.combine!.includes(s.key) && s.propertyId);
  if (parts.length === 0) throw new HttpError(503, `Nenhum site de "${site.label}" está configurado.`);
  const reports = await Promise.all(parts.map((p) => getSiteReport(p.key, days)));

  const daily = new Map<string, { date: string; users: number; sessions: number }>();
  for (const d of reports.flatMap((r) => r.daily)) {
    const prev = daily.get(d.date);
    daily.set(d.date, prev ? { date: d.date, users: prev.users + d.users, sessions: prev.sessions + d.sessions } : { ...d });
  }

  return {
    site: site.key, label: site.label, group: site.group, days, updatedAt: new Date().toISOString(),
    combinedOf: parts.map((p) => p.label),
    totals: {
      current: mergeTotals(reports.map((r) => r.totals.current)),
      previous: mergeTotals(reports.map((r) => r.totals.previous)),
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    channels: mergeBy(reports.map((r) => r.channels), "sessions"),
    // Páginas não somam entre LPs (o "/" de cada LP é outra página): junta e mostra de qual LP é
    pages: reports
      .flatMap((r) => r.pages.map((p) => ({ ...p, siteLabel: r.label })))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    sources: mergeBy(reports.map((r) => r.sources), "sessions"),
    devices: mergeBy(reports.map((r) => r.devices), "users"),
    cities: mergeBy(reports.map((r) => r.cities), "users"),
  };
}

export async function getSiteReport(siteKey: string, days: number): Promise<SiteReport> {
  const site = env.gaSites.find((s) => s.key === siteKey);
  if (!site) throw new HttpError(404, "Site não encontrado");
  if (site.combine) return getCombinedReport(site, days);
  if (!site.propertyId) throw new HttpError(503, `Propriedade do Google Analytics da ${site.label} não configurada.`);

  const cacheKey = `${siteKey}:${days}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const current: DateRange = { startDate: `${days - 1}daysAgo`, endDate: "today" };
  const previous: DateRange = { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo` };
  const desc = (metric: string) => [{ metric: { metricName: metric }, desc: true }];

  const [totals, daily, channels, pages, sources] = await batchRunReports(site.propertyId, [
    { dateRanges: [current, previous], metrics: TOTAL_METRICS.map((name) => ({ name })) },
    {
      dateRanges: [current], dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
    { dateRanges: [current], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: desc("sessions"), limit: 10 },
    {
      dateRanges: [current], dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: desc("screenPageViews"), limit: 10,
    },
    { dateRanges: [current], dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }], orderBys: desc("sessions"), limit: 10 },
  ], site.hostname);
  const [devices, cities] = await batchRunReports(site.propertyId, [
    { dateRanges: [current], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }], orderBys: desc("activeUsers") },
    { dateRanges: [current], dimensions: [{ name: "city" }], metrics: [{ name: "activeUsers" }], orderBys: desc("activeUsers"), limit: 10 },
  ], site.hostname);

  // Com dois períodos, o GA devolve a dimensão "dateRange" (date_range_0 = atual, date_range_1 = anterior)
  const totalRows = rowsOf(totals);
  const pick = (range: string) => {
    const row = totalRows.find((r) => r.dateRange === range) ?? {};
    return Object.fromEntries(TOTAL_METRICS.map((m) => [m, Number(row[m] ?? 0)]));
  };

  const data: SiteReport = {
    site: site.key,
    label: site.label,
    group: site.group,
    days,
    updatedAt: new Date().toISOString(),
    totals: { current: pick("date_range_0"), previous: pick("date_range_1") },
    daily: rowsOf(daily).map((r) => ({
      date: `${String(r.date).slice(0, 4)}-${String(r.date).slice(4, 6)}-${String(r.date).slice(6, 8)}`,
      users: Number(r.activeUsers),
      sessions: Number(r.sessions),
    })),
    channels: rowsOf(channels).map((r) => ({ name: String(r.sessionDefaultChannelGroup), sessions: Number(r.sessions) })),
    pages: rowsOf(pages).map((r) => ({
      path: String(r.pagePath), title: String(r.pageTitle), views: Number(r.screenPageViews), users: Number(r.activeUsers),
    })),
    sources: rowsOf(sources).map((r) => ({ name: String(r.sessionSourceMedium), sessions: Number(r.sessions) })),
    devices: rowsOf(devices).map((r) => ({ name: String(r.deviceCategory), users: Number(r.activeUsers) })),
    cities: rowsOf(cities).map((r) => ({ name: String(r.city), users: Number(r.activeUsers) })),
  };

  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

// Pesquisas de Marketing pelo treg (treg.to):
// - anúncios que os concorrentes estão rodando no Facebook/Instagram (Biblioteca de Anúncios da Meta)
// - o que as pessoas buscam no Google (volume mensal, custo por clique, concorrência, tendência)
// Cada pesquisa fica guardada: serve de histórico e, se repetida no mesmo dia, sai do banco sem custo.

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
  /** image, video, carousel, dpa (catálogo), ... */
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

const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_KEYWORDS = 15;

async function callTreg<T>(tool: string, body: unknown, maxCostUsd: number): Promise<{ data: T; costMicro: number }> {
  if (!env.tregToken) throw new HttpError(503, "Pesquisa não configurada: falta o TREG_TOKEN no servidor.");
  let res: Response;
  try {
    res = await fetch(`${env.tregBaseUrl}/call/${tool}`, {
      method: "POST",
      headers: {
        "X-Treg-Token": env.tregToken,
        "Content-Type": "application/json",
        // Teto por pesquisa: se o provedor barato falhar, não deixa cair num caro
        "X-Treg-Route-Max-Cost": String(maxCostUsd),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(502, "Não foi possível falar com o treg. Verifique a internet do servidor.");
  }
  const costMicro = Number(res.headers.get("x-treg-cost-micro")) || 0;
  if (res.status === 402) throw new HttpError(402, "Saldo do treg acabou. Peça ao administrador para recarregar.");
  if (res.status === 401 || res.status === 403) throw new HttpError(503, "Token do treg inválido. Fale com o administrador.");
  if (!res.ok) throw new HttpError(502, `A pesquisa falhou (erro ${res.status}). Tente de novo em instantes.`);
  return { data: (await res.json().catch(() => ({}))) as T, costMicro };
}

// ─── Anúncios ─────────────────────────────────────────────────────────────────

interface RawAd {
  ad_archive_id?: string; ad_url?: string; page_name?: string; page_url?: string | null; page_likes?: number | null;
  body?: string | null; title?: string | null; cta?: string | null; link_url?: string | null; link_caption?: string | null;
  display_format?: string | null; images?: string[] | null; videos?: string[] | null; cards?: { image?: string; body?: string }[] | null;
  platforms?: string[] | null; start_date?: string | null; is_active?: boolean | null;
}

function normalizeAd(a: RawAd): CompetitorAd | null {
  if (!a.ad_archive_id) return null;
  const images = [...(a.images ?? []), ...((a.cards ?? []).map((c) => c.image).filter(Boolean) as string[])];
  return {
    id: a.ad_archive_id,
    url: a.ad_url ?? `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`,
    pageName: a.page_name ?? "—",
    pageUrl: a.page_url ?? null,
    pageLikes: a.page_likes ?? null,
    body: (a.body ?? a.cards?.[0]?.body ?? "").trim(),
    title: a.title ?? null,
    cta: a.cta ?? null,
    linkUrl: a.link_url ?? null,
    linkCaption: a.link_caption ?? null,
    format: (a.display_format ?? "image").toLowerCase(),
    images: [...new Set(images)].slice(0, 6),
    video: a.videos?.[0] ?? null,
    platforms: a.platforms ?? [],
    startDate: a.start_date ?? null,
    isActive: a.is_active ?? true,
  };
}

/** "facebook.com/PrintiBR" → URL; "printi.com.br" → domínio; senão é o nome da empresa */
function advertiserBody(input: string) {
  const v = input.trim();
  if (/facebook\.com\//i.test(v)) return { facebook_url: v.startsWith("http") ? v : `https://${v}` };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))) {
    return { company_domain: v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""), company_name: v.split(".")[0] };
  }
  return { company_name: v };
}

async function searchAds(kind: "ADS_ADVERTISER" | "ADS_KEYWORD", query: string) {
  if (kind === "ADS_ADVERTISER") {
    const { data, costMicro } = await callTreg<{ output?: { ads?: RawAd[] } }>("treg.meta-ads.library.advertiser", advertiserBody(query), 0.02);
    return { ads: (data.output?.ads ?? []).map(normalizeAd).filter(Boolean) as CompetitorAd[], costMicro };
  }
  const { data, costMicro } = await callTreg<{ rows?: RawAd[] }>(
    "crawl4ai.meta-ads.library.search", { query, country: "BR", active_status: "active", limit: 50 }, 0.02,
  );
  // A Biblioteca casa as palavras soltas: "cartão de visita" trazia concessionária ("cartão de crédito" +
  // "venha fazer uma visita"). Fica só o anúncio que tem a expressão, com plural ("cartões de visita") valendo.
  const relevant = (data.rows ?? []).filter((a) => containsPhrase(
    [a.body, a.title, a.link_caption, a.page_name, ...(a.cards ?? []).map((c) => c.body)].join(" . "), query,
  ));
  return { ads: relevant.map(normalizeAd).filter(Boolean) as CompetitorAd[], costMicro };
}

/** "Olá, Cartões de Visita!" → " ola cartao de visita " — sem acento, minúsculo, plural no singular */
function phraseKey(s: string | null | undefined) {
  const singular = (w: string) => (w.length <= 3 ? w
    : w.replace(/oes$|aes$/, "ao").replace(/ais$/, "al").replace(/eis$/, "el").replace(/ns$/, "m").replace(/(?<=[aeiou])s$/, ""));
  const words = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  return ` ${words.map(singular).join(" ")} `;
}
const containsPhrase = (text: string, phrase: string) => phraseKey(text).includes(phraseKey(phrase).trimEnd());

// ─── Buscas no Google ─────────────────────────────────────────────────────────

interface RawKeyword {
  keyword?: string; volume?: number | null; cpc?: number | null; competition?: number | null;
  difficulty?: number | null; history_trend?: Record<string, number> | null; is_data_found?: boolean;
}

async function searchKeywords(query: string) {
  const seeds = [...new Set(query.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_KEYWORDS);
  if (!seeds.length) throw new HttpError(400, "Digite pelo menos uma palavra.");
  let costMicro = 0;
  let keywords = seeds;
  // Uma palavra só: busca também as variações que o Google sugere ("cartão de visita digital", "...com qr code")
  if (seeds.length === 1) {
    try {
      const ideas = await callTreg<{ output?: { keywords?: { value?: string }[] } }>(
        "treg.google.keywords.ideas", { keyword: seeds[0], country: "br", language: "pt", limit: 20 }, 0.01,
      );
      costMicro += ideas.costMicro;
      const suggested = (ideas.data.output?.keywords ?? []).map((k) => k.value?.trim().toLowerCase()).filter(Boolean) as string[];
      keywords = [...new Set([seeds[0], ...suggested])].slice(0, MAX_KEYWORDS);
    } catch { /* sem sugestões: segue só com a palavra digitada */ }
  }
  const vol = await callTreg<{ output?: { rows?: RawKeyword[] } }>(
    "treg.google.keywords.volume", { keywords, country: "br", language: "pt" }, 0.05,
  );
  costMicro += vol.costMicro;
  const byKeyword = new Map((vol.data.output?.rows ?? []).map((r) => [r.keyword?.toLowerCase(), r]));
  const rows: KeywordRow[] = keywords.map((k) => {
    const r = byKeyword.get(k);
    return {
      keyword: k,
      // Sem dados no Google (busca rara demais) não é o mesmo que zero
      volume: r?.is_data_found === false ? null : r?.volume ?? null,
      cpc: r?.cpc ?? null,
      competition: r?.competition ?? null,
      difficulty: r?.difficulty ?? null,
      trend: Object.entries(r?.history_trend ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([month, volume]) => ({ month, volume })),
      isSeed: seeds.includes(k),
    };
  });
  rows.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
  return { rows, costMicro };
}

// ─── Pesquisa + histórico ─────────────────────────────────────────────────────

const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").slice(0, 100);

function toDto(r: { id: string; kind: string; query: string; result: string; itemCount: number; costMicro: number; createdAt: Date; user: { name: string } }, cached = false) {
  return { id: r.id, kind: r.kind, query: r.query, itemCount: r.itemCount, costMicro: r.costMicro, createdAt: r.createdAt, userName: r.user.name, cached, result: JSON.parse(r.result) };
}

export async function runResearch(kind: ResearchKind, rawQuery: string, userId: string) {
  const query = normalizeQuery(rawQuery);
  if (query.length < 2) throw new HttpError(400, "Digite o que quer pesquisar.");

  // Mesma pesquisa nas últimas 24 h: devolve a guardada, sem custo
  const recent = await prisma.marketingResearch.findFirst({
    where: { kind, query: { equals: query }, createdAt: { gte: new Date(Date.now() - CACHE_MS) } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return toDto(recent, true);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const today = await prisma.marketingResearch.count({ where: { userId, createdAt: { gte: since } } });
  if (today >= env.tregMarketingDailyLimit) {
    throw new HttpError(429, `Limite de ${env.tregMarketingDailyLimit} pesquisas por dia atingido. Tente amanhã.`);
  }

  let result: unknown, itemCount: number, costMicro: number;
  if (kind === "KEYWORDS") {
    const r = await searchKeywords(query);
    result = { rows: r.rows };
    itemCount = r.rows.length;
    costMicro = r.costMicro;
  } else {
    const r = await searchAds(kind, query);
    result = { ads: r.ads };
    itemCount = r.ads.length;
    costMicro = r.costMicro;
  }

  const saved = await prisma.marketingResearch.create({
    data: { kind, query, result: JSON.stringify(result), itemCount, costMicro, userId },
    include: { user: { select: { name: true } } },
  });
  return toDto(saved);
}

export async function listResearch(kinds: ResearchKind[]) {
  const rows = await prisma.marketingResearch.findMany({
    where: { kind: { in: kinds } },
    select: { id: true, kind: true, query: true, itemCount: true, costMicro: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return rows.map(({ user, ...r }) => ({ ...r, userName: user.name }));
}

export async function getResearch(id: string) {
  const r = await prisma.marketingResearch.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!r) throw new HttpError(404, "Pesquisa não encontrada.");
  return toDto(r);
}

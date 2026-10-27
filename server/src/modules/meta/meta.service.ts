import { env } from "../../config/env";
import { prisma } from "../../db/prisma";

const GRAPH = "https://graph.instagram.com/v21.0";

export type IgAccount = { id: string; token: string; name: string };

export function getAccounts(): IgAccount[] {
  return env.metaInstagramAccounts;
}

export function getAccount(name: string): IgAccount | undefined {
  return env.metaInstagramAccounts.find(a => a.name === name);
}

async function igGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json() as T & { error?: { message: string } };
  if ((json as { error?: { message: string } }).error) throw new Error((json as { error: { message: string } }).error.message);
  return json;
}

async function igPost<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as T & { error?: { message: string } };
  if ((json as { error?: { message: string } }).error) throw new Error((json as { error: { message: string } }).error.message);
  return json;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(account: IgAccount) {
  return igGet<{
    id: string; name: string; username: string; biography?: string;
    followers_count: number; follows_count: number; media_count: number;
    profile_picture_url?: string; website?: string;
  }>(account.id, account.token, {
    fields: "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website",
  });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(account: IgAccount, limit = 20) {
  const res = await igGet<{
    data: {
      id: string; caption?: string; media_type: string; media_product_type?: string; media_url?: string;
      thumbnail_url?: string; permalink: string; timestamp: string;
      like_count?: number; comments_count?: number;
    }[];
  }>(`${account.id}/media`, account.token, {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return res.data ?? [];
}

// ─── Insights ─────────────────────────────────────────────────────────────────
// A Meta aposentou "impressions" em 2025: pedir essa métrica fazia a chamada inteira falhar (tudo zerado).
// Série por dia só existe para reach e follower_count; o resto vem como total do período.

export async function getAccountInsights(account: IgAccount, days = 30) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - Math.min(days, 30) * 86400;
  try {
    const res = await igGet<{
      data: { name: string; period: string; values: { value: number; end_time: string }[] }[];
    }>(`${account.id}/insights`, account.token, {
      metric: "reach,follower_count",
      period: "day",
      since: String(since),
      until: String(until),
    });
    return res.data ?? [];
  } catch { return []; }
}

const TOTAL_METRICS = ["reach", "views", "profile_views", "accounts_engaged", "total_interactions", "website_clicks"];

/** Totais da conta num período (até 30 dias): visualizações, alcance, visitas ao perfil, cliques no site... */
export async function getAccountTotals(account: IgAccount, sinceSec: number, untilSec: number): Promise<Record<string, number>> {
  try {
    const res = await igGet<{ data: { name: string; total_value?: { value: number } }[] }>(`${account.id}/insights`, account.token, {
      metric: TOTAL_METRICS.join(","),
      period: "day",
      metric_type: "total_value",
      since: String(sinceSec),
      until: String(untilSec),
    });
    return Object.fromEntries((res.data ?? []).map((m) => [m.name, m.total_value?.value ?? 0]));
  } catch { return {}; }
}

export async function getPostInsights(account: IgAccount, mediaId: string) {
  try {
    const res = await igGet<{
      data: { name: string; values: { value: number }[]; title: string }[];
    }>(`${mediaId}/insights`, account.token, {
      metric: "reach,views,likes,comments,shares,saved,total_interactions",
    });
    return res.data ?? [];
  } catch { return []; }
}

/** Alcance, visualizações, salvamentos e compartilhamentos de um post, num objeto simples */
async function postMetrics(account: IgAccount, mediaId: string): Promise<Record<string, number> | null> {
  const data = await getPostInsights(account, mediaId);
  if (!data.length) return null;
  return Object.fromEntries(data.map((m) => [m.name, m.values?.[0]?.value ?? 0]));
}

// ─── Publish ──────────────────────────────────────────────────────────────────

async function pollContainer(account: IgAccount, containerId: string, maxAttempts: number, delayMs: number): Promise<{ id: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    const status = await igGet<{ status_code: string }>(containerId, account.token, { fields: "status_code" });
    console.log(`[Meta] Container ${containerId}: ${status.status_code} (${i + 1}/${maxAttempts})`);
    if (status.status_code === "FINISHED") {
      return igPost<{ id: string }>(`${account.id}/media_publish`, account.token, { creation_id: containerId });
    }
    if (status.status_code === "ERROR") {
      throw new Error("Instagram não conseguiu processar a mídia. Verifique se a imagem/vídeo é válido e tente novamente.");
    }
    if (status.status_code === "EXPIRED") {
      throw new Error("Container de mídia expirou no Instagram. Tente publicar novamente.");
    }
  }
  throw new Error("Instagram demorou demais para processar a mídia. Tente novamente.");
}

// Fast publish for "post now" — max ~15s wait, errors return immediately
export async function publishPhoto(account: IgAccount, imageUrl: string, caption: string, fast = false) {
  console.log(`[Meta] publishPhoto → ${imageUrl}`);
  const container = await igPost<{ id: string }>(`${account.id}/media`, account.token, { image_url: imageUrl, caption });
  return pollContainer(account, container.id, fast ? 3 : 12, fast ? 5000 : 5000);
}

export async function publishReel(account: IgAccount, videoUrl: string, caption: string, coverUrl?: string, fast = false) {
  console.log(`[Meta] publishReel → ${videoUrl}`);
  const body: Record<string, string> = { video_url: videoUrl, caption, media_type: "REELS" };
  if (coverUrl) body.cover_url = coverUrl;
  const container = await igPost<{ id: string }>(`${account.id}/media`, account.token, body);
  return pollContainer(account, container.id, fast ? 6 : 18, 5000);
}

export async function publishStory(account: IgAccount, mediaUrl: string, isVideo = false, fast = false) {
  console.log(`[Meta] publishStory → ${mediaUrl}`);
  const body: Record<string, string> = isVideo
    ? { video_url: mediaUrl, media_type: "STORIES" }
    : { image_url: mediaUrl, media_type: "STORIES" };
  const container = await igPost<{ id: string }>(`${account.id}/media`, account.token, body);
  return pollContainer(account, container.id, fast ? 4 : 12, 5000);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface AccountSummary {
  account: string;
  profile: Awaited<ReturnType<typeof getProfile>> | null;
  posts: (Awaited<ReturnType<typeof getPosts>>[number] & { insights?: Record<string, number> | null })[];
  insights: Awaited<ReturnType<typeof getAccountInsights>>;
  /** Totais dos últimos 28 dias e dos 28 dias anteriores (para mostrar a variação) */
  totals: { current: Record<string, number>; previous: Record<string, number> };
}

const PERIOD_DAYS = 28;
const POSTS_WITH_INSIGHTS = 12;

export async function getAllAccountsSummary(): Promise<AccountSummary[]> {
  const now = Math.floor(Date.now() / 1000);
  const period = PERIOD_DAYS * 86400;
  const results = await Promise.allSettled(
    getAccounts().map(async (acc): Promise<AccountSummary> => {
      const [profile, posts, insights, current, previous] = await Promise.allSettled([
        getProfile(acc),
        getPosts(acc, 30),
        getAccountInsights(acc, 30),
        getAccountTotals(acc, now - period, now),
        getAccountTotals(acc, now - 2 * period, now - period),
      ]);
      const postList = posts.status === "fulfilled" ? posts.value : [];
      // Métricas por post (salvamentos, compartilhamentos...) dos mais recentes
      const metrics = await Promise.all(postList.slice(0, POSTS_WITH_INSIGHTS).map((p) => postMetrics(acc, p.id)));
      return {
        account: acc.name,
        profile: profile.status === "fulfilled" ? profile.value : null,
        posts: postList.map((p, i) => ({ ...p, insights: metrics[i] ?? null })),
        insights: insights.status === "fulfilled" ? insights.value : [],
        totals: {
          current: current.status === "fulfilled" ? current.value : {},
          previous: previous.status === "fulfilled" ? previous.value : {},
        },
      };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<AccountSummary> => r.status === "fulfilled")
    .map(r => r.value);
}

// ─── Social Post CRUD ─────────────────────────────────────────────────────────

export async function createScheduledPost(data: {
  account: string; mediaType: string; mediaUrl: string; coverUrl?: string;
  caption: string; scheduledAt: Date; createdById: string;
}) {
  return prisma.socialPost.create({ data: { ...data, status: "PENDING" } });
}

export async function listScheduledPosts() {
  return prisma.socialPost.findMany({
    orderBy: { scheduledAt: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}

export async function deleteScheduledPost(id: string) {
  return prisma.socialPost.delete({ where: { id } });
}

// ─── Scheduler (runs every minute) ───────────────────────────────────────────

export function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    const due = await prisma.socialPost.findMany({
      where: { status: "PENDING", scheduledAt: { lte: now } },
    });
    for (const post of due) {
      const account = getAccount(post.account);
      if (!account) continue;
      try {
        let result: { id: string };
        if (post.mediaType === "REELS") {
          result = await publishReel(account, post.mediaUrl, post.caption, post.coverUrl ?? undefined);
        } else if (post.mediaType === "STORIES") {
          const isVideo = /\.(mp4|mov|avi|webm)$/i.test(post.mediaUrl);
          result = await publishStory(account, post.mediaUrl, isVideo);
        } else {
          result = await publishPhoto(account, post.mediaUrl, post.caption);
        }
        await prisma.socialPost.update({
          where: { id: post.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), igMediaId: result.id },
        });
        console.log(`[SocialPlanner] Publicado: ${post.id} → ${result.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        await prisma.socialPost.update({
          where: { id: post.id },
          data: { status: "FAILED", errorMsg: msg },
        });
        console.error(`[SocialPlanner] Falha ao publicar ${post.id}:`, msg);
      }
    }
  }, 60_000);
}

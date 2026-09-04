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
      id: string; caption?: string; media_type: string; media_url?: string;
      thumbnail_url?: string; permalink: string; timestamp: string;
      like_count?: number; comments_count?: number;
    }[];
  }>(`${account.id}/media`, account.token, {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return res.data ?? [];
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export async function getAccountInsights(account: IgAccount, days = 30) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  try {
    const res = await igGet<{
      data: { name: string; period: string; values: { value: number; end_time: string }[] }[];
    }>(`${account.id}/insights`, account.token, {
      metric: "impressions,reach,profile_views,follower_count",
      period: "day",
      since: String(since),
      until: String(until),
    });
    return res.data ?? [];
  } catch { return []; }
}

export async function getPostInsights(account: IgAccount, mediaId: string) {
  try {
    const res = await igGet<{
      data: { name: string; values: { value: number }[]; title: string }[];
    }>(`${mediaId}/insights`, account.token, {
      metric: "impressions,reach,likes,comments,shares,saved,total_interactions",
    });
    return res.data ?? [];
  } catch { return []; }
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
  posts: Awaited<ReturnType<typeof getPosts>>;
  insights: Awaited<ReturnType<typeof getAccountInsights>>;
}

export async function getAllAccountsSummary(): Promise<AccountSummary[]> {
  const results = await Promise.allSettled(
    getAccounts().map(async (acc): Promise<AccountSummary> => {
      const [profile, posts, insights] = await Promise.allSettled([
        getProfile(acc),
        getPosts(acc, 12),
        getAccountInsights(acc, 30),
      ]);
      return {
        account: acc.name,
        profile: profile.status === "fulfilled" ? profile.value : null,
        posts: posts.status === "fulfilled" ? posts.value : [],
        insights: insights.status === "fulfilled" ? insights.value : [],
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

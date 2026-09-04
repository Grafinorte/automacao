import { api } from "./client";

export interface IgProfile {
  id: string; name: string; username: string; biography?: string;
  followers_count: number; follows_count: number; media_count: number;
  profile_picture_url?: string; website?: string;
}

export interface IgPost {
  id: string; caption?: string; media_type: string; media_url?: string;
  thumbnail_url?: string; permalink: string; timestamp: string;
  like_count?: number; comments_count?: number;
}

export interface IgInsight {
  name: string; period: string;
  values: { value: number; end_time: string }[];
}

export interface IgAccountSummary {
  account: string; profile: IgProfile | null; posts: IgPost[]; insights: IgInsight[];
}

export interface SocialPost {
  id: string; account: string; mediaType: string; mediaUrl: string;
  coverUrl?: string | null; caption: string; scheduledAt: string;
  status: string; publishedAt?: string | null; errorMsg?: string | null;
  igMediaId?: string | null; createdAt: string;
  createdBy: { id: string; name: string };
}

export const metaApi = {
  getAccounts: () => api.get<{ name: string; id: string }[]>("/marketing/meta/accounts"),
  getSummary: () => api.get<IgAccountSummary[]>("/marketing/meta/summary"),
  getProfile: (account: string) => api.get<IgProfile>(`/marketing/meta/${account}/profile`),
  getPosts: (account: string, limit = 20) => api.get<IgPost[]>(`/marketing/meta/${account}/posts?limit=${limit}`),
  getInsights: (account: string, days = 30) => api.get<IgInsight[]>(`/marketing/meta/${account}/insights?days=${days}`),

  uploadMedia: async (file: File): Promise<{ url: string; filename: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/marketing/meta/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro no upload");
    return res.json();
  },

  publishNow: (account: string, data: { mediaUrl: string; caption: string; mediaType: string; coverUrl?: string }) =>
    api.post<{ id: string }>(`/marketing/meta/${account}/publish`, data),

  getScheduledPosts: () => api.get<SocialPost[]>("/marketing/meta/schedule"),
  schedulePost: (data: { account: string; mediaUrl: string; caption: string; mediaType: string; coverUrl?: string; scheduledAt: string }) =>
    api.post<SocialPost>("/marketing/meta/schedule", data),
  deleteScheduledPost: (id: string) => api.delete<{ ok: boolean }>(`/marketing/meta/schedule/${id}`),
};

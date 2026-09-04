import { api } from "./client";

export interface CompetitorProfile {
  id: string;
  handle: string;
  name: string;
  niche: string;
  createdAt: string;
  reports: { id: string; generatedAt: string }[];
}

export interface CompetitorInsight {
  competitor: string;
  summary: string;
  postFrequency: string;
  contentThemes: string[];
  topPerformingContent: string;
  estimatedEngagement: string;
  recentHighlights: string[];
  recommendations: string[];
  warnings: string[];
  analyzedAt: string;
}

export interface CompetitorReport {
  id: string;
  profileId: string;
  analysis: CompetitorInsight;
  generatedAt: string;
}

export const competitorApi = {
  getProfiles: () => api.get<CompetitorProfile[]>("/marketing/competitor"),
  addProfile: (handle: string, name: string, niche: string) =>
    api.post<CompetitorProfile>("/marketing/competitor", { handle, name, niche }),
  deleteProfile: (id: string) => api.delete<{ ok: boolean }>(`/marketing/competitor/${id}`),
  getReport: (id: string) => api.get<CompetitorReport>(`/marketing/competitor/${id}/report`),
  getHistory: (id: string) => api.get<CompetitorReport[]>(`/marketing/competitor/${id}/history`),
  triggerAnalysis: (id: string) => api.post<{ ok: boolean; message: string }>(`/marketing/competitor/${id}/analyze`, {}),
};

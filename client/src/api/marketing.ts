import { api } from "./client";
import type {
  Campaign,
  CampaignDetail,
  CampaignStatus,
  ContentBoardColumn,
  ContentItem,
  ContentStatus,
  MarketingChannel,
} from "../types";

export interface CampaignInput {
  name: string;
  objective?: string | null;
  channel: MarketingChannel;
  status?: CampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  notes?: string | null;
  ownerId?: string;
}

export interface ContentItemInput {
  title: string;
  type: string;
  channel: MarketingChannel;
  status?: ContentStatus;
  scheduledDate?: string | null;
  notes?: string | null;
  campaignId?: string | null;
  assigneeId?: string | null;
}

export const marketingApi = {
  listCampaigns: () => api.get<Campaign[]>("/marketing/campaigns"),
  getCampaign: (id: string) => api.get<CampaignDetail>(`/marketing/campaigns/${id}`),
  createCampaign: (data: CampaignInput) => api.post<Campaign>("/marketing/campaigns", data),
  updateCampaign: (id: string, data: Partial<CampaignInput>) =>
    api.patch<Campaign>(`/marketing/campaigns/${id}`, data),
  deleteCampaign: (id: string) => api.delete<void>(`/marketing/campaigns/${id}`),

  getContentBoard: () => api.get<ContentBoardColumn[]>("/marketing/content/board"),
  createContentItem: (data: ContentItemInput) => api.post<ContentItem>("/marketing/content", data),
  updateContentItem: (id: string, data: Partial<ContentItemInput>) =>
    api.patch<ContentItem>(`/marketing/content/${id}`, data),
  deleteContentItem: (id: string) => api.delete<void>(`/marketing/content/${id}`),
  moveContentItem: (id: string, toStatus: ContentStatus, toIndex: number) =>
    api.patch<void>(`/marketing/content/${id}/move`, { toStatus, toIndex }),
};

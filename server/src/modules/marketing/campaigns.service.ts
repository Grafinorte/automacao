import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { CampaignStatus, MarketingChannel } from "../../generated/prisma/client";

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  objective: true,
  channel: true,
  status: true,
  startDate: true,
  endDate: true,
  budget: true,
  notes: true,
  createdAt: true,
  owner: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { contentItems: true } },
} as const;

export function listCampaigns() {
  return prisma.campaign.findMany({
    select: CAMPAIGN_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export function getCampaign(id: string) {
  return prisma.campaign.findUniqueOrThrow({
    where: { id },
    select: {
      ...CAMPAIGN_SELECT,
      contentItems: { orderBy: { scheduledDate: "asc" } },
    },
  });
}

export function createCampaign(data: {
  name: string;
  objective?: string | null;
  channel: MarketingChannel;
  status?: CampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  notes?: string | null;
  ownerId: string;
  createdById: string;
}) {
  return prisma.campaign.create({
    data: {
      name: data.name,
      objective: data.objective || null,
      channel: data.channel,
      status: data.status ?? "PLANEJAMENTO",
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      budget: data.budget ?? null,
      notes: data.notes || null,
      ownerId: data.ownerId,
      createdById: data.createdById,
    },
    select: CAMPAIGN_SELECT,
  });
}

export function updateCampaign(
  id: string,
  data: {
    name?: string;
    objective?: string | null;
    channel?: MarketingChannel;
    status?: CampaignStatus;
    startDate?: string | null;
    endDate?: string | null;
    budget?: number | null;
    notes?: string | null;
    ownerId?: string;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.objective !== undefined) updateData.objective = data.objective;
  if (data.channel !== undefined) updateData.channel = data.channel;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.budget !== undefined) updateData.budget = data.budget;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;

  return prisma.campaign.update({ where: { id }, data: updateData, select: CAMPAIGN_SELECT });
}

export async function deleteCampaign(id: string) {
  const contentCount = await prisma.contentItem.count({ where: { campaignId: id } });
  if (contentCount > 0) {
    throw new HttpError(
      400,
      "Não é possível excluir uma campanha com peças de conteúdo vinculadas. Desvincule ou exclua as peças primeiro."
    );
  }
  await prisma.campaign.delete({ where: { id } });
}

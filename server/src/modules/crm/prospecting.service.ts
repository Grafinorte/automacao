import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import * as dealsService from "./deals.service";

// Prospecção: busca empresas reais no Google Maps através do treg (treg.to) e guarda o histórico.

export interface ProspectingInput {
  segmento: string;
  regiao: string;
  company: "GRAFINORTE" | "PLUSPACK";
}

interface MapsPlace {
  name?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  place_id?: string | null;
  url?: string | null;
}

/** Só os dígitos finais (DDD + número) para comparar telefones escritos de jeitos diferentes */
function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function searchGoogleMaps(query: string): Promise<{ places: MapsPlace[]; costMicro: number; provider: string | null }> {
  if (!env.tregToken) {
    throw new HttpError(503, "Prospecção não configurada: falta o TREG_TOKEN no servidor.");
  }
  let res: Response;
  try {
    res = await fetch(`${env.tregBaseUrl}/call/treg.google.serp.maps`, {
      method: "POST",
      headers: {
        "X-Treg-Token": env.tregToken,
        "Content-Type": "application/json",
        // Teto por busca: se o provedor barato falhar, não deixa cair num caro
        "X-Treg-Route-Max-Cost": "0.02",
      },
      body: JSON.stringify({ q: query, country: "br", language: "pt" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new HttpError(502, "Não foi possível falar com o treg. Verifique a internet do servidor.");
  }
  const costMicro = Number(res.headers.get("x-treg-cost-micro")) || 0;
  if (res.status === 402) throw new HttpError(402, "Saldo do treg acabou. Peça ao administrador para recarregar.");
  if (res.status === 401 || res.status === 403) throw new HttpError(503, "Token do treg inválido. Fale com o administrador.");
  if (!res.ok) throw new HttpError(502, `A busca no Google Maps falhou (erro ${res.status}). Tente de novo.`);

  const body = (await res.json().catch(() => null)) as { output?: { places?: MapsPlace[] } } | null;
  return {
    places: body?.output?.places ?? [],
    costMicro,
    provider: res.headers.get("x-treg-served-by"),
  };
}

const LEAD_SELECT = {
  id: true, placeId: true, name: true, phone: true, website: true, address: true, category: true,
  rating: true, reviewCount: true, mapsUrl: true, status: true, contactId: true, dealId: true,
  addedById: true, addedAt: true, createdAt: true,
} as const;

type LeadRow = { id: string; placeId: string | null; phone: string | null; addedById: string | null; [k: string]: unknown };

/** Marca em cada lead: já está no CRM? já apareceu numa busca anterior? quem adicionou? */
async function decorateLeads<T extends LeadRow>(leads: T[], searchId: string) {
  const contacts = await prisma.contact.findMany({ where: { phone: { not: null } }, select: { phone: true } });
  const crmPhones = new Set(contacts.map((c) => phoneKey(c.phone)).filter(Boolean) as string[]);

  const placeIds = leads.map((l) => l.placeId).filter(Boolean) as string[];
  const earlier = placeIds.length
    ? await prisma.prospectLead.findMany({
        where: { placeId: { in: placeIds }, searchId: { not: searchId } },
        select: { placeId: true, status: true, createdAt: true, search: { select: { user: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const firstSeen = new Map<string, { at: Date; by: string; status: string }>();
  for (const e of earlier) {
    if (!e.placeId) continue;
    const prev = firstSeen.get(e.placeId);
    // Guarda a primeira vez que apareceu, mas se em algum momento foi para o CRM, mostra isso
    if (!prev) firstSeen.set(e.placeId, { at: e.createdAt, by: e.search.user.name, status: e.status });
    else if (e.status === "ADICIONADO") prev.status = "ADICIONADO";
  }

  const userIds = [...new Set(leads.map((l) => l.addedById).filter(Boolean) as string[])];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));

  return leads.map((l) => {
    const key = phoneKey(l.phone);
    const seen = l.placeId ? firstSeen.get(l.placeId) : undefined;
    return {
      ...l,
      inCrm: !!key && crmPhones.has(key),
      seenBefore: seen ? { at: seen.at, by: seen.by, status: seen.status } : null,
      addedByName: l.addedById ? userName.get(l.addedById) ?? null : null,
    };
  });
}

export async function runSearch(input: ProspectingInput, userId: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const today = await prisma.prospectSearch.count({ where: { userId, createdAt: { gte: since } } });
  if (today >= env.tregDailyLimitPerUser) {
    throw new HttpError(429, `Limite de ${env.tregDailyLimitPerUser} buscas por dia atingido. Tente amanhã.`);
  }

  const query = `${input.segmento} em ${input.regiao}`;
  const { places, costMicro, provider } = await searchGoogleMaps(query);

  // O mesmo lugar pode vir repetido; fica só uma vez
  const unique = new Map<string, MapsPlace>();
  for (const p of places) {
    if (!p.name) continue;
    unique.set(p.place_id || `${p.name}|${p.address ?? ""}`, p);
  }

  const search = await prisma.prospectSearch.create({
    data: {
      segmento: input.segmento,
      regiao: input.regiao,
      query,
      company: input.company,
      resultCount: unique.size,
      costMicro,
      provider,
      userId,
      leads: {
        create: [...unique.values()].map((p) => ({
          placeId: p.place_id || null,
          name: p.name!,
          phone: p.phone || null,
          website: p.website || null,
          address: p.address || null,
          category: p.category || null,
          rating: typeof p.rating === "number" ? p.rating : null,
          reviewCount: typeof p.review_count === "number" ? p.review_count : null,
          mapsUrl: p.url || null,
        })),
      },
    },
  });
  return getSearch(search.id);
}

export async function listSearches(opts: { userId?: string; take?: number }) {
  const searches = await prisma.prospectSearch.findMany({
    where: opts.userId ? { userId: opts.userId } : {},
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    select: {
      id: true, segmento: true, regiao: true, company: true, resultCount: true, costMicro: true, createdAt: true,
      user: { select: { id: true, name: true } },
      leads: { select: { status: true } },
    },
  });
  return searches.map(({ leads, ...s }) => ({
    ...s,
    addedCount: leads.filter((l) => l.status === "ADICIONADO").length,
    discardedCount: leads.filter((l) => l.status === "DESCARTADO").length,
  }));
}

export async function getSearch(id: string) {
  const search = await prisma.prospectSearch.findUnique({
    where: { id },
    select: {
      id: true, segmento: true, regiao: true, query: true, company: true, resultCount: true, costMicro: true,
      provider: true, createdAt: true,
      user: { select: { id: true, name: true } },
      leads: { select: LEAD_SELECT, orderBy: { createdAt: "asc" } },
    },
  });
  if (!search) throw new HttpError(404, "Busca não encontrada");
  return { ...search, leads: await decorateLeads(search.leads, search.id) };
}

/** Cria contato + negócio na primeira etapa do funil, com origem "Prospecção ativa" */
export async function addLeadToCrm(leadId: string, userId: string) {
  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId }, include: { search: true } });
  if (!lead) throw new HttpError(404, "Empresa não encontrada");
  if (lead.status === "ADICIONADO") throw new HttpError(409, "Esta empresa já foi adicionada ao CRM.");

  const stage = await prisma.crmStage.findFirst({ where: { isClosed: false }, orderBy: { order: "asc" } });
  if (!stage) throw new HttpError(400, "O funil do CRM não tem etapas abertas.");

  const details = [
    lead.category ? `Ramo: ${lead.category}` : null,
    lead.address ? `Endereço: ${lead.address}` : null,
    lead.website ? `Site: ${lead.website}` : null,
    lead.rating != null ? `Google: ${lead.rating.toFixed(1)}★ (${lead.reviewCount ?? 0} avaliações)` : null,
    lead.mapsUrl ? `Maps: ${lead.mapsUrl}` : null,
  ].filter(Boolean).join("\n");

  const contact = await prisma.contact.create({
    data: {
      name: lead.name,
      company: lead.name,
      phone: lead.phone,
      notes: [details, `Prospecção: "${lead.search.query}"`].filter(Boolean).join("\n"),
    },
  });
  const deal = await dealsService.createDeal({
    title: lead.name,
    contactId: contact.id,
    stageId: stage.id,
    company: lead.search.company,
    source: "PROSPECCAO_ATIVA",
    sourceDetail: `Google Maps — ${lead.search.query}`,
    notes: details || null,
    ownerId: userId,
    createdById: userId,
  });

  await prisma.prospectLead.update({
    where: { id: lead.id },
    data: { status: "ADICIONADO", contactId: contact.id, dealId: deal.id, addedById: userId, addedAt: new Date() },
  });
  return { contactId: contact.id, dealId: deal.id };
}

export async function setLeadStatus(leadId: string, status: "NOVO" | "DESCARTADO") {
  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) throw new HttpError(404, "Empresa não encontrada");
  if (lead.status === "ADICIONADO") throw new HttpError(409, "Empresa já está no CRM.");
  return prisma.prospectLead.update({ where: { id: leadId }, data: { status }, select: LEAD_SELECT });
}

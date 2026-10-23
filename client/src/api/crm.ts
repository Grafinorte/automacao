import { api } from "./client";
import type {
  Contact,
  ContactWithDeals,
  CrmStage,
  CrmStageBase,
  Deal,
  DealActivity,
  DealDetail,
  LeadSource,
  ProspectLead,
  ProspectSearch,
  ProspectSearchSummary,
} from "../types";

export interface ContactInput {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface DealInput {
  title: string;
  contactId: string;
  stageId?: string;
  value?: number;
  expectedCloseDate?: string | null;
  notes?: string | null;
  ownerId?: string;
  nextFollowUp?: string | null;
  lossReason?: string | null;
  company?: string;
  source?: LeadSource | null;
  sourceDetail?: string | null;
}

export interface ImportContactsResult {
  created: number;
  skipped: number;
}

export const crmApi = {
  getBoard: (owner?: string) =>
    api.get<CrmStage[]>(`/crm/board${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`),

  addStage: (name: string) => api.post<CrmStage>("/crm/stages", { name }),
  renameStage: (id: string, name: string) => api.patch<CrmStage>(`/crm/stages/${id}`, { name }),
  reorderStages: (orderedStageIds: string[]) =>
    api.patch<void>("/crm/stages/reorder", { orderedStageIds }),
  deleteStage: (id: string) => api.delete<void>(`/crm/stages/${id}`),

  listContacts: () => api.get<Contact[]>("/crm/contacts"),
  getContact: (id: string) => api.get<ContactWithDeals>(`/crm/contacts/${id}`),
  createContact: (data: ContactInput) => api.post<Contact>("/crm/contacts", data),
  updateContact: (id: string, data: Partial<ContactInput>) =>
    api.patch<Contact>(`/crm/contacts/${id}`, data),
  deleteContact: (id: string) => api.delete<void>(`/crm/contacts/${id}`),
  importContacts: (contacts: ContactInput[]) =>
    api.post<ImportContactsResult>("/crm/contacts/import", { contacts }),

  getDeal: (id: string) => api.get<DealDetail>(`/crm/deals/${id}`),
  createDeal: (data: DealInput) => api.post<Deal>("/crm/deals", data),
  updateDeal: (id: string, data: Partial<DealInput> & { quoteId?: string | null }) =>
    api.patch<Deal>(`/crm/deals/${id}`, data),
  deleteDeal: (id: string) => api.delete<void>(`/crm/deals/${id}`),
  moveDeal: (id: string, toStageId: string, toIndex: number) =>
    api.patch<void>(`/crm/deals/${id}/move`, { toStageId, toIndex }),

  addActivity: (dealId: string, body: string) =>
    api.post<DealActivity>(`/crm/deals/${dealId}/activities`, { body }),

  listStages: () => api.get<CrmStageBase[]>("/crm/stages"),
  setupDefaultStages: () => api.post<{ created: number; skipped: boolean }>("/crm/stages/setup-defaults", {}),

  // Prospecção (Google Maps via treg)
  searchProspects: (data: { segmento: string; regiao: string; company: "GRAFINORTE" | "PLUSPACK" }) =>
    api.post<ProspectSearch>("/crm/prospecting/searches", data),
  listProspectSearches: (mine?: boolean) =>
    api.get<ProspectSearchSummary[]>(`/crm/prospecting/searches${mine ? "?mine=1" : ""}`),
  getProspectSearch: (id: string) => api.get<ProspectSearch>(`/crm/prospecting/searches/${id}`),
  addProspectToCrm: (leadId: string) =>
    api.post<{ contactId: string; dealId: string }>(`/crm/prospecting/leads/${leadId}/add`, {}),
  setProspectStatus: (leadId: string, status: "NOVO" | "DESCARTADO") =>
    api.patch<ProspectLead>(`/crm/prospecting/leads/${leadId}`, { status }),
};

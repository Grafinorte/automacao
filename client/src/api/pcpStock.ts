import { api } from "./client";

export type PcpMovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

export const PCP_COMPANIES = [
  { id: "GRAFINORTE", label: "Grafinorte" },
  { id: "PLUSPACK", label: "Pluspack" },
] as const;

export const PCP_CATEGORIES = [
  { group: "Embalagens", options: ["Copo", "Pote", "Balde", "Sacola", "Outra embalagem"] },
  { group: "Impressos", options: ["Folder", "Catálogo", "Flyer", "Cartão", "Cartaz", "Outro impresso"] },
] as const;

export const PCP_UNITS = ["un", "cx", "pct", "fardo", "milheiro"] as const;

export interface PcpStockItem {
  id: string;
  company: string;
  osNumber: string | null;
  client: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  location: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PcpItemInput {
  company: string;
  osNumber: string;
  client: string | null;
  name: string;
  category: string;
  unit: string;
  location: string | null;
  notes: string | null;
}

export interface PcpMovement {
  id: string;
  type: PcpMovementType;
  quantity: number;
  balanceAfter: number;
  takenBy: string | null;
  invoiceNumber: string | null;
  reference: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  item: { id: string; company: string; osNumber: string | null; client: string | null; name: string; unit: string; category: string };
}

export interface PcpSettings {
  recipients: string;
  senderUserId: string | null;
  lastPeriodSent: string | null;
  lastSentAt: string | null;
  lastError: string | null;
  senders: { id: string; name: string; smtpEmail: string | null }[];
}

export const pcpStockApi = {
  listItems: () => api.get<PcpStockItem[]>("/estoque-pcp/items"),
  createItem: (data: PcpItemInput & { quantity: number }) => api.post<PcpStockItem>("/estoque-pcp/items", data),
  updateItem: (id: string, data: PcpItemInput) => api.patch<PcpStockItem>(`/estoque-pcp/items/${id}`, data),
  archiveItem: (id: string) => api.delete<void>(`/estoque-pcp/items/${id}`),
  addMovement: (id: string, data: { type: PcpMovementType; quantity: number; takenBy?: string; invoiceNumber?: string; notes?: string }) =>
    api.post<{ movement: unknown; item: PcpStockItem }>(`/estoque-pcp/items/${id}/movements`, data),
  listMovements: (month: string) => api.get<PcpMovement[]>(`/estoque-pcp/movements?month=${month}`),
  getSettings: () => api.get<PcpSettings>("/estoque-pcp/settings"),
  saveSettings: (data: { recipients: string; senderUserId: string | null }) => api.put<PcpSettings>("/estoque-pcp/settings", data),
  sendReport: () => api.post<PcpSettings>("/estoque-pcp/report/send", {}),
};

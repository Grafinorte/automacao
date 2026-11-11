import { api } from "./client";

export type PcpMovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

export const PCP_COMPANIES = [
  { id: "GRAFINORTE", label: "Grafinorte" },
  { id: "PLUSPACK", label: "Pluspack" },
] as const;

export const PCP_CATEGORIES = [
  { group: "Embalagens", options: ["Caixa", "Copo", "Pote", "Balde", "Sacola", "Outra embalagem"] },
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
  stage: PcpStage;
  stageAt: string | null;
  stageBy: string | null;
  stockedAt: string | null;
  orderedQty: number | null;
  plannedQty: number | null;
  createdAt: string;
}

export type PcpStage = "PRODUCAO" | "EXPEDICAO" | "ESTOQUE";

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
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  dispatchedQty?: number;   // quanto desta nota já saiu (despacho em partes)
  billedQty?: number;       // nos cartões "Despachado": o total da nota daquela viagem
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

export interface PcpOsData {
  osNumber: string | null;
  company: "GRAFINORTE" | "PLUSPACK" | null;
  client: string | null;
  clientCode: string | null;
  name: string | null;
  category: string | null;
  orderedQty: number | null;
  plannedQty: number | null;
  perPack: number | null;
}

export interface PcpItemHistory extends PcpStockItem {
  active: boolean;
  movements: (Omit<PcpMovement, "item" | "dispatchedQty" | "billedQty"> & {
    dispatches: { id: string; quantity: number; notes: string | null; dispatchedBy: string; dispatchedAt: string }[];
  })[];
}

export const pcpStockApi = {
  history: (id: string) => api.get<PcpItemHistory>(`/estoque-pcp/items/${id}/history`),
  readOs: (pdf: string) => api.post<PcpOsData>("/estoque-pcp/ler-os", { pdf }),
  listItems: () => api.get<PcpStockItem[]>("/estoque-pcp/items"),
  createItem: (data: PcpItemInput & { quantity: number; stage: "PRODUCAO" | "ESTOQUE"; orderedQty: number | null; plannedQty: number | null }) =>
    api.post<PcpStockItem>("/estoque-pcp/items", data),
  moveStage: (id: string, to: "PRODUCAO" | "EXPEDICAO") => api.post<PcpStockItem>(`/estoque-pcp/items/${id}/stage`, { to }),
  receive: (id: string, quantity: number, notes: string) => api.post<PcpStockItem>(`/estoque-pcp/items/${id}/receive`, { quantity, notes }),
  listDispatch: () => api.get<{ pending: PcpMovement[]; done: PcpMovement[] }>("/estoque-pcp/dispatch"),
  dispatch: (movementId: string, quantity: number, notes: string) =>
    api.post<{ remaining: number; complete: boolean }>(`/estoque-pcp/movements/${movementId}/dispatch`, { quantity, notes }),
  updateItem: (id: string, data: PcpItemInput) => api.patch<PcpStockItem>(`/estoque-pcp/items/${id}`, data),
  removeItem: (id: string) => api.delete<{ result: "deleted" | "archived" }>(`/estoque-pcp/items/${id}`),
  invoice: (data: { invoiceNumber: string; takenBy: string; notes: string; noDispatch: boolean; lines: { itemId: string; quantity: number }[] }) =>
    api.post<{ invoiceNumber: string; movements: number }>("/estoque-pcp/faturar", data),
  addMovement: (id: string, data: { type: PcpMovementType; quantity: number; takenBy?: string; invoiceNumber?: string; notes?: string; noDispatch?: boolean }) =>
    api.post<{ movement: unknown; item: PcpStockItem }>(`/estoque-pcp/items/${id}/movements`, data),
  listMovements: (month: string) => api.get<PcpMovement[]>(`/estoque-pcp/movements?month=${month}`),
  getSettings: () => api.get<PcpSettings>("/estoque-pcp/settings"),
  saveSettings: (data: { recipients: string; senderUserId: string | null }) => api.put<PcpSettings>("/estoque-pcp/settings", data),
  sendReport: () => api.post<PcpSettings>("/estoque-pcp/report/send", {}),
};

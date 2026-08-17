import { api } from "./client";

export type ProdStatus = "ARTE" | "IMPRESSAO" | "ACABAMENTO" | "ENTREGA" | "CONCLUIDO" | "CANCELADO";
export type ProdPriority = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";

export interface ProductionOrder {
  id: string;
  number: number;
  title: string;
  clientName: string;
  status: ProdStatus;
  priority: ProdPriority;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
}

export interface CreateOrderInput {
  title: string;
  clientName: string;
  priority?: ProdPriority;
  dueDate?: string | null;
  notes?: string | null;
}

export const productionApi = {
  list: () => api.get<ProductionOrder[]>("/production"),
  create: (data: CreateOrderInput) => api.post<ProductionOrder>("/production", data),
  update: (id: string, data: Partial<CreateOrderInput & { status: ProdStatus }>) =>
    api.patch<ProductionOrder>(`/production/${id}`, data),
  advance: (id: string) => api.post<ProductionOrder>(`/production/${id}/advance`, {}),
  cancel: (id: string) => api.post<ProductionOrder>(`/production/${id}/cancel`, {}),
  remove: (id: string) => api.delete<void>(`/production/${id}`),
};

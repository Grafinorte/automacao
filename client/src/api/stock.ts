import { api } from "./client";
import type { StockItem, StockMovement, StockMovementType } from "../types";

export const stockApi = {
  listItems: () => api.get<StockItem[]>("/stock/items"),

  createItem: (data: {
    name: string; category: string; unit: string;
    quantity?: number; minQuantity?: number; location?: string; notes?: string;
  }) => api.post<StockItem>("/stock/items", data),

  updateItem: (id: string, data: Partial<{
    name: string; category: string; unit: string;
    minQuantity: number; location: string; notes: string;
  }>) => api.patch<StockItem>(`/stock/items/${id}`, data),

  deleteItem: (id: string) => api.delete<void>(`/stock/items/${id}`),

  addMovement: (id: string, type: StockMovementType, quantity: number, notes?: string) =>
    api.post<{ movement: StockMovement; item: StockItem }>(`/stock/items/${id}/movements`, { type, quantity, notes }),

  getMovements: (id: string) =>
    api.get<StockMovement[]>(`/stock/items/${id}/movements`),

  getRecentMovements: () =>
    api.get<StockMovement[]>("/stock/movements/recent"),
};

import { api } from "./client";
import type { Product } from "../types";

export interface ProductInput {
  name: string;
  specifications: string;
  unitPrice?: number | null;
}

export const productsApi = {
  list: (all = false) => api.get<Product[]>(`/products${all ? "?all=true" : ""}`),
  create: (data: ProductInput) => api.post<Product>("/products", data),
  update: (id: string, data: Partial<ProductInput & { active: boolean }>) =>
    api.patch<Product>(`/products/${id}`, data),
  remove: (id: string) => api.delete<void>(`/products/${id}`),
};

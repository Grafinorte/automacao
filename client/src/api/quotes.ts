import { api } from "./client";
import type { IssuingCompany, Quote, QuoteListItem } from "../types";

export interface QuoteItemInput {
  productId?: string | null;
  productName: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteInput {
  issuingCompany: IssuingCompany;
  clientName: string;
  clientContact?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  items: QuoteItemInput[];
}

export const quotesApi = {
  list: () => api.get<QuoteListItem[]>("/quotes"),
  get: (id: string) => api.get<Quote>(`/quotes/${id}`),
  create: (data: QuoteInput) => api.post<Quote>("/quotes", data),
  remove: (id: string) => api.delete<void>(`/quotes/${id}`),
  pdfUrl: (id: string) => `/api/quotes/${id}/pdf`,
  sendEmail: (id: string, to: string) => api.post<{ ok: boolean }>(`/quotes/${id}/send-email`, { to }),
};

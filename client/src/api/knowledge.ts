import { api } from "./client";

export interface DocInfo {
  name: string;
  ext: string;
  sizeBytes: number;
}

export interface AskResult {
  answer: string;
  sources: string[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: { role: "user" | "assistant"; content: string; sources?: string[] }[];
}

export const knowledgeApi = {
  listDocuments: () => api.get<DocInfo[]>("/knowledge/documents"),
  ask: (question: string, history: { role: "user" | "assistant"; content: string }[]) =>
    api.post<AskResult>("/knowledge/ask", { question, history }),

  listConversations: () => api.get<ConversationSummary[]>("/knowledge/conversations"),
  getConversation: (id: string) => api.get<ConversationDetail>(`/knowledge/conversations/${id}`),
  saveConversation: (id: string, title: string, messages: unknown[]) =>
    api.put<ConversationDetail>(`/knowledge/conversations/${id}`, { title, messages }),
  deleteConversation: (id: string) => api.delete<void>(`/knowledge/conversations/${id}`),
};

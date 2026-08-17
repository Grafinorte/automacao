import { api } from "./client";

export interface HrConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface HrChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const hrAssistantApi = {
  ask(question: string, history: HrChatMessage[]): Promise<{ answer: string }> {
    return api.post("/hr-assistant/ask", { question, history });
  },
  listConversations(): Promise<HrConversationSummary[]> {
    return api.get("/hr-assistant/conversations");
  },
  getConversation(id: string): Promise<{ id: string; title: string; messages: HrChatMessage[] }> {
    return api.get(`/hr-assistant/conversations/${id}`);
  },
  saveConversation(id: string, title: string, messages: HrChatMessage[]): Promise<HrConversationSummary> {
    return api.put(`/hr-assistant/conversations/${id}`, { title, messages });
  },
  deleteConversation(id: string): Promise<void> {
    return api.delete(`/hr-assistant/conversations/${id}`);
  },
};

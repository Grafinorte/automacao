import { api } from "./client";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export const assistantApi = {
  chat: (messages: AssistantMessage[]) =>
    api.post<AssistantMessage>("/assistant/chat", { messages }),
};

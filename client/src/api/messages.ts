import { api } from "./client";
import type { MessageAttachment, TaskUserRef } from "../types";

export interface ConversationSummary {
  user: TaskUserRef;
  lastMessage: { body: string; createdAt: string; fromMe: boolean } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  senderId: string;
  recipientId: string;
  attachments: MessageAttachment[];
}

export const messagesApi = {
  conversations: () => api.get<ConversationSummary[]>("/messages/conversations"),
  thread: (userId: string) => api.get<Message[]>(`/messages/with/${userId}`),
  send: (
    recipientId: string,
    body: string,
    attachments?: { fileUrl: string; fileName: string }[]
  ) => api.post<Message>("/messages", { recipientId, body, attachments }),
  uploadFile: (file: File): Promise<{ fileUrl: string; fileName: string }> => {
    const form = new FormData();
    form.append("file", file, file.name);
    return fetch("/api/messages/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const b = await r.json().catch(() => ({ error: "Erro ao enviar arquivo" }));
        const err = new Error(b.error ?? "Erro ao enviar arquivo") as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r.json() as Promise<{ fileUrl: string; fileName: string }>;
    });
  },
  markRead: (userId: string) => api.patch<void>(`/messages/with/${userId}/read`),
  unreadCount: () => api.get<{ count: number }>("/messages/unread-count"),
};

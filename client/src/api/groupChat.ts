import { api } from "./client";
import type { TaskUserRef } from "../types";

export interface GroupChatSummary {
  id: string;
  name: string;
  createdAt: string;
  createdById: string;
  members: { user: TaskUserRef }[];
  messages: { id: string; body: string; createdAt: string; senderId: string }[];
}

export interface GroupMessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
}

export interface GroupMessage {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: TaskUserRef;
  attachments: GroupMessageAttachment[];
}

export const groupChatApi = {
  list: () => api.get<GroupChatSummary[]>("/group-chats"),
  create: (name: string, memberIds: string[]) =>
    api.post<GroupChatSummary>("/group-chats", { name, memberIds }),
  get: (id: string) => api.get<GroupChatSummary>(`/group-chats/${id}`),
  delete: (id: string) => api.delete<void>(`/group-chats/${id}`),
  addMember: (id: string, userId: string) =>
    api.post<GroupChatSummary>(`/group-chats/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) =>
    api.delete<GroupChatSummary>(`/group-chats/${id}/members/${userId}`),
  getMessages: (id: string) => api.get<GroupMessage[]>(`/group-chats/${id}/messages`),
  sendMessage: (id: string, body: string, attachments?: { fileUrl: string; fileName: string }[]) =>
    api.post<GroupMessage>(`/group-chats/${id}/messages`, { body, attachments }),
};

import { api } from "./client";

export interface WaPhoneNumber {
  id: string;
  phoneNumberId: string;
  displayName: string;
  phone?: string | null;
  accessToken?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WaLabel {
  id: string;
  name: string;
  color: string;
}

export interface WaConversationLabel {
  label: WaLabel;
}

export interface WaContact {
  id: string;
  phone: string;
  name: string;
  notes?: string | null;
  crmContactId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface WaConversation {
  id: string;
  contactId: string;
  contact: WaContact;
  status: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessageText?: string | null;
  assignedToId?: string | null;
  assignedTo?: WaUser | null;
  phoneNumberId?: string | null;
  labels: WaConversationLabel[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WaMessageReplyTo {
  id: string;
  text?: string | null;
  direction: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  sentBy?: WaUser | null;
}

export interface WaMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  isInternal: boolean;
  text?: string | null;
  waMessageId?: string | null;
  status: string;
  sentById?: string | null;
  sentBy?: WaUser | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  replyToId?: string | null;
  replyTo?: WaMessageReplyTo | null;
  starred?: boolean;
  forwarded?: boolean;
  createdAt: string;
}

export interface WaAutomation {
  id: string;
  name: string;
  keyword: string;
  matchType: string;
  response: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WaStats {
  open: number;
  unread: number;
  total: number;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | string;
  category: string;
  language: string;
  components: { type: string; format?: string; text?: string }[];
}

export interface WaTemplate {
  id: string;
  name: string;
  text: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const whatsappApi = {
  getStats: () => api.get<WaStats>("/whatsapp/stats"),

  getConversations: (status?: string) =>
    api.get<WaConversation[]>(`/whatsapp/conversations${status ? `?status=${status}` : ""}`),

  getConversationMessages: (id: string) =>
    api.get<{ conversation: WaConversation; messages: WaMessage[] }>(
      `/whatsapp/conversations/${id}/messages`
    ),

  patchConversation: (id: string, data: { status?: string; assignedToId?: string | null; pinned?: boolean }) =>
    api.patch<WaConversation>(`/whatsapp/conversations/${id}`, data),

  getContacts: () => api.get<WaContact[]>("/whatsapp/contacts"),

  patchContact: (id: string, data: { name?: string; notes?: string; crmContactId?: string | null }) =>
    api.patch<WaContact>(`/whatsapp/contacts/${id}`, data),

  getAutomations: () => api.get<WaAutomation[]>("/whatsapp/automations"),

  createAutomation: (data: { name: string; keyword: string; matchType?: string; response: string; active?: boolean }) =>
    api.post<WaAutomation>("/whatsapp/automations", data),

  updateAutomation: (id: string, data: Partial<WaAutomation>) =>
    api.patch<WaAutomation>(`/whatsapp/automations/${id}`, data),

  deleteAutomation: (id: string) => api.delete<{ ok: boolean }>(`/whatsapp/automations/${id}`),

  startConversation: (data: { phone: string; name?: string; text: string; phoneNumberId?: string }) =>
    api.post<{ conversation: WaConversation; message: WaMessage }>("/whatsapp/conversations/start", data),

  // Meta Message Templates
  getMetaTemplates: () => api.get<MetaTemplate[]>("/whatsapp/meta-templates"),

  createMetaTemplate: (data: { name: string; category?: string; language?: string; bodyText: string; exampleValues?: string[] }) =>
    api.post<{ id: string; status: string }>("/whatsapp/meta-templates", data),

  sendTemplateMessage: (data: { phone: string; name?: string; templateName: string; language?: string; variables?: string[]; headerMediaUrl?: string; headerMediaType?: string; headerFileName?: string; phoneNumberId?: string }) =>
    api.post<{ conversation: WaConversation; message: WaMessage }>("/whatsapp/meta-templates/send", data),

  // Templates
  getTemplates: () => api.get<WaTemplate[]>("/whatsapp/templates"),

  createTemplate: (data: { name: string; text: string }) =>
    api.post<WaTemplate>("/whatsapp/templates", data),

  updateTemplate: (id: string, data: Partial<WaTemplate>) =>
    api.patch<WaTemplate>(`/whatsapp/templates/${id}`, data),

  deleteTemplate: (id: string) => api.delete<{ ok: boolean }>(`/whatsapp/templates/${id}`),

  // Media
  uploadMedia: async (file: File): Promise<{ mediaId: string; mimetype: string; filename: string; localFilename: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/whatsapp/media/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Erro" }));
      throw new Error(body.error ?? "Erro no upload");
    }
    return res.json();
  },

  sendMediaMessage: (conversationId: string, data: { mediaId: string; mimetype: string; caption?: string; localFilename?: string; filename?: string }) =>
    api.post<WaMessage>(`/whatsapp/conversations/${conversationId}/media`, data),

  sendMessage: (conversationId: string, text: string, replyToId?: string, isInternal?: boolean, forwarded?: boolean) =>
    api.post<WaMessage>(`/whatsapp/conversations/${conversationId}/messages`, { text, replyToId, isInternal, forwarded }),

  updateMessage: (id: string, text: string) =>
    api.patch<WaMessage>(`/whatsapp/messages/${id}`, { text }),

  starMessage: (id: string, starred: boolean) =>
    api.patch<WaMessage>(`/whatsapp/messages/${id}/star`, { starred }),

  deleteMessage: (id: string) =>
    api.delete<{ ok: boolean }>(`/whatsapp/messages/${id}`),

  getLinkPreview: (url: string) =>
    api.get<{ title: string; description: string; image: string; domain: string }>(`/whatsapp/link-preview?url=${encodeURIComponent(url)}`),

  // Labels
  getLabels: () => api.get<WaLabel[]>("/whatsapp/labels"),
  createLabel: (data: { name: string; color: string }) => api.post<WaLabel>("/whatsapp/labels", data),
  deleteLabel: (id: string) => api.delete<{ ok: boolean }>(`/whatsapp/labels/${id}`),
  addLabel: (conversationId: string, labelId: string) =>
    api.post<WaConversation>(`/whatsapp/conversations/${conversationId}/labels/${labelId}`, {}),
  removeLabel: (conversationId: string, labelId: string) =>
    api.delete<WaConversation>(`/whatsapp/conversations/${conversationId}/labels/${labelId}`),

  // Agents
  getAgents: () => api.get<WaUser[]>("/whatsapp/agents"),

  // Phone numbers
  getPhoneNumbers: () => api.get<WaPhoneNumber[]>("/whatsapp/phone-numbers"),
  createPhoneNumber: (data: { phoneNumberId: string; displayName: string; phone?: string; accessToken?: string }) =>
    api.post<WaPhoneNumber>("/whatsapp/phone-numbers", data),
  updatePhoneNumber: (id: string, data: Partial<{ displayName: string; phone: string; accessToken: string; active: boolean }>) =>
    api.patch<WaPhoneNumber>(`/whatsapp/phone-numbers/${id}`, data),
  deletePhoneNumber: (id: string) => api.delete<{ ok: boolean }>(`/whatsapp/phone-numbers/${id}`),
};

import { api } from "./client";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => api.get<AppNotification[]>("/notifications"),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: string) => api.patch<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<{ ok: boolean }>("/notifications/mark-all-read", {}),
};

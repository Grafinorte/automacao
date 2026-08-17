import { api } from "./client";
import type { AdminUser, Role, SessionUser, TaskUserRef } from "../types";

export const usersApi = {
  list: () => api.get<AdminUser[]>("/users"),
  directory: () => api.get<TaskUserRef[]>("/users/directory"),
  create: (data: { name: string; email: string; password: string; role: Role }) =>
    api.post<AdminUser>("/users", data),
  update: (id: string, data: Partial<{ name: string; email: string; role: Role; password: string; permissions: string[] | null; waPhoneNumberId: string | null }>) =>
    api.patch<AdminUser>(`/users/${id}`, data),
  activate: (id: string) => api.patch<AdminUser>(`/users/${id}/activate`),
  deactivate: (id: string) => api.patch<AdminUser>(`/users/${id}/deactivate`),
  updateMyAvatar: (imageBase64: string) =>
    api.patch<SessionUser>("/users/me/avatar", { imageBase64 }),
  updateMyArea: (role: Role) =>
    api.patch<SessionUser>("/users/me/area", { role }),
  getMyEmailSettings: () =>
    api.get<{ smtpEmail: string | null }>("/users/me/email-settings"),
  updateMyEmailSettings: (smtpEmail: string, smtpAppPassword: string) =>
    api.patch<{ ok: boolean }>("/users/me/email-settings", { smtpEmail, smtpAppPassword }),
};

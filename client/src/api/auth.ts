import { api } from "./client";
import type { SessionUser } from "../types";

export const authApi = {
  login: (email: string, password: string) =>
    api.post<SessionUser>("/auth/login", { email, password }),
  logout: () => api.post<void>("/auth/logout"),
  me: () => api.get<SessionUser>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch<void>("/auth/password", { currentPassword, newPassword }),
};

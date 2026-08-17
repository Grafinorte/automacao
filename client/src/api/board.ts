import { api } from "./client";
import type { Board, BoardSummary, TaskUserRef } from "../types";

export const boardApi = {
  list: () => api.get<BoardSummary[]>("/board/list"),
  get: (boardId: string, userId?: string) =>
    api.get<Board>(`/board/${boardId}${userId ? `?user=${encodeURIComponent(userId)}` : ""}`),
  create: (name: string, description?: string) =>
    api.post<BoardSummary>("/board", { name, description }),
  delete: (boardId: string) => api.delete<void>(`/board/${boardId}/delete`),

  getMembers: (boardId: string) =>
    api.get<{ user: TaskUserRef }[]>(`/board/${boardId}/members`),
  addMember: (boardId: string, userId: string) =>
    api.post<void>(`/board/${boardId}/members`, { userId }),
  removeMember: (boardId: string, userId: string) =>
    api.delete<void>(`/board/${boardId}/members/${userId}`),

  addColumn: (boardId: string, name: string) =>
    api.post<Board["columns"][number]>("/board/columns/add", { name, boardId }),
  renameColumn: (id: string, name: string) =>
    api.patch<Board["columns"][number]>(`/board/columns/${id}`, { name }),
  reorderColumns: (orderedColumnIds: string[]) =>
    api.patch<void>("/board/columns/reorder", { orderedColumnIds }),
  deleteColumn: (id: string) => api.delete<void>(`/board/columns/${id}`),
};

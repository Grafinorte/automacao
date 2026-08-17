import { api } from "./client";
import type { Priority, Task, TaskAttachment, TaskSubtask } from "../types";

export interface TaskInput {
  title: string;
  description?: string | null;
  columnId?: string;
  assigneeId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
}

export const tasksApi = {
  create: (data: TaskInput) => api.post<Task>("/tasks", data),
  update: (id: string, data: Partial<TaskInput>) => api.patch<Task>(`/tasks/${id}`, data),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),
  move: (id: string, toColumnId: string, toIndex: number) =>
    api.patch<void>(`/tasks/${id}/move`, { toColumnId, toIndex }),
  uploadAttachment: (taskId: string, dataUrl: string, fileName: string) =>
    api.post<TaskAttachment>(`/tasks/${taskId}/attachments`, { dataUrl, fileName }),
  deleteAttachment: (taskId: string, attachmentId: string) =>
    api.delete<void>(`/tasks/${taskId}/attachments/${attachmentId}`),
  createSubtask: (taskId: string, title: string) =>
    api.post<TaskSubtask>(`/tasks/${taskId}/subtasks`, { title }),
  toggleSubtask: (taskId: string, subtaskId: string, done: boolean) =>
    api.patch<TaskSubtask>(`/tasks/${taskId}/subtasks/${subtaskId}`, { done }),
  deleteSubtask: (taskId: string, subtaskId: string) =>
    api.delete<void>(`/tasks/${taskId}/subtasks/${subtaskId}`),
  addMember: (taskId: string, userId: string) =>
    api.post<Task>(`/tasks/${taskId}/members`, { userId }),
  removeMember: (taskId: string, userId: string) =>
    api.delete<Task>(`/tasks/${taskId}/members/${userId}`),
};

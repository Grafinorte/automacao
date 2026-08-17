import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { saveAttachment, deleteAttachmentFile } from "../../utils/attachmentStorage";
import type { Priority } from "../../generated/prisma/client";
import { createNotification } from "../notifications/notifications.service";

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  order: true,
  columnId: true,
  createdAt: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  attachments: {
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      uploadedAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { uploadedAt: "asc" as const },
  },
  subtasks: {
    select: { id: true, title: true, done: true, order: true },
    orderBy: { order: "asc" as const },
  },
  members: {
    select: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
} as const;

export function listTasks(assigneeId?: string) {
  return prisma.task.findMany({
    where: assigneeId ? { assigneeId } : undefined,
    select: TASK_SELECT,
    orderBy: { order: "asc" },
  });
}

export function getTask(id: string) {
  return prisma.task.findUniqueOrThrow({ where: { id }, select: TASK_SELECT });
}

export async function createTask(data: {
  title: string;
  description?: string;
  columnId: string;
  assigneeId?: string;
  priority?: Priority;
  dueDate?: string;
  createdById: string;
}) {
  const last = await prisma.task.findFirst({
    where: { columnId: data.columnId },
    orderBy: { order: "desc" },
  });
  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      columnId: data.columnId,
      assigneeId: data.assigneeId || null,
      priority: data.priority ?? "MEDIUM",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: data.createdById,
      order: (last?.order ?? -1) + 1,
    },
    select: TASK_SELECT,
  });

  if (task.assignee && task.assignee.id !== data.createdById) {
    createNotification(
      task.assignee.id,
      "task_assigned",
      "Nova tarefa atribuída",
      task.title,
      "/tarefas"
    ).catch(() => {});
  }

  return task;
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    priority?: Priority;
    dueDate?: string | null;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.dueDate !== undefined) {
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  const before = await prisma.task.findUnique({ where: { id }, select: { assigneeId: true, createdById: true } });

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    select: TASK_SELECT,
  });

  if (
    updated.assignee &&
    data.assigneeId !== undefined &&
    data.assigneeId !== before?.assigneeId &&
    updated.assignee.id !== updated.createdBy.id
  ) {
    createNotification(
      updated.assignee.id,
      "task_assigned",
      "Nova tarefa atribuída",
      updated.title,
      "/tarefas"
    ).catch(() => {});
  }

  return updated;
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
}

export async function addTaskAttachment(taskId: string, uploadedById: string, dataUrl: string, fileName: string) {
  const fileUrl = saveAttachment("tasks", taskId, dataUrl);
  return prisma.taskAttachment.create({
    data: { taskId, uploadedById, fileName, fileUrl },
    select: { id: true, fileName: true, fileUrl: true, uploadedAt: true, uploadedBy: { select: { id: true, name: true } } },
  });
}

export async function removeTaskAttachment(attachmentId: string) {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw new HttpError(404, "Anexo não encontrado");
  deleteAttachmentFile(attachment.fileUrl);
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
}

export async function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new HttpError(404, "Tarefa não encontrada");
  }

  const fromColumnId = task.columnId;

  await prisma.$transaction(async (tx) => {
    if (fromColumnId === toColumnId) {
      const siblings = await tx.task.findMany({
        where: { columnId: fromColumnId, id: { not: taskId } },
        orderBy: { order: "asc" },
      });
      siblings.splice(toIndex, 0, task);
      await Promise.all(
        siblings.map((t, index) =>
          tx.task.update({ where: { id: t.id }, data: { order: index } })
        )
      );
    } else {
      const sourceSiblings = await tx.task.findMany({
        where: { columnId: fromColumnId, id: { not: taskId } },
        orderBy: { order: "asc" },
      });
      const destSiblings = await tx.task.findMany({
        where: { columnId: toColumnId },
        orderBy: { order: "asc" },
      });
      destSiblings.splice(toIndex, 0, task);

      await Promise.all([
        ...sourceSiblings.map((t, index) =>
          tx.task.update({ where: { id: t.id }, data: { order: index } })
        ),
        ...destSiblings.map((t, index) =>
          tx.task.update({
            where: { id: t.id },
            data: {
              order: index,
              ...(t.id === taskId ? { columnId: toColumnId } : {}),
            },
          })
        ),
      ]);
    }
  });
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export async function createSubtask(taskId: string, title: string) {
  const last = await prisma.taskSubtask.findFirst({
    where: { taskId }, orderBy: { order: "desc" },
  });
  return prisma.taskSubtask.create({
    data: { taskId, title, order: (last?.order ?? -1) + 1 },
    select: { id: true, title: true, done: true, order: true },
  });
}

export async function toggleSubtask(id: string, done: boolean) {
  return prisma.taskSubtask.update({
    where: { id },
    data: { done },
    select: { id: true, title: true, done: true, order: true },
  });
}

export async function deleteSubtask(id: string) {
  await prisma.taskSubtask.delete({ where: { id } });
}

// ── Task Members ──────────────────────────────────────────────────────────────

export async function addTaskMember(taskId: string, userId: string) {
  await prisma.taskMember.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  });
  return prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });
}

export async function removeTaskMember(taskId: string, userId: string) {
  await prisma.taskMember.deleteMany({ where: { taskId, userId } });
  return prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });
}

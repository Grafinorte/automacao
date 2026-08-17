import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

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

function boardWhere(userId: string, userRole: string) {
  if (userRole === "ADMIN") return {};
  return {
    OR: [
      { isDefault: true },
      { members: { some: { userId } } },
    ],
  };
}

export async function listBoards(userId: string, userRole: string) {
  return prisma.board.findMany({
    where: boardWhere(userId, userRole),
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function getBoard(boardId: string, userId: string, userRole: string, assigneeId?: string) {
  const where = boardWhere(userId, userRole);
  const board = await prisma.board.findFirst({
    where: { id: boardId, ...where },
    include: {
      columns: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            where: assigneeId ? { assigneeId } : undefined,
            orderBy: { order: "asc" },
            select: TASK_SELECT,
          },
        },
      },
      members: {
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!board) throw new HttpError(403, "Quadro não encontrado ou acesso negado.");
  return board;
}

export async function createBoard(name: string, description?: string) {
  return prisma.board.create({
    data: { name, description, isDefault: false },
    select: { id: true, name: true, description: true, isDefault: true, createdAt: true, _count: { select: { members: true } } },
  });
}

export async function deleteBoard(id: string) {
  const board = await prisma.board.findUnique({ where: { id } });
  if (!board) throw new HttpError(404, "Quadro não encontrado");
  if (board.isDefault) throw new HttpError(400, "Não é possível excluir o quadro padrão");
  await prisma.board.delete({ where: { id } });
}

// ── Board members ─────────────────────────────────────────────────────────────

export async function listBoardMembers(boardId: string) {
  return prisma.boardMember.findMany({
    where: { boardId },
    select: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function addBoardMember(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new HttpError(404, "Quadro não encontrado");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Usuário não encontrado");

  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId, userId } },
    create: { boardId, userId },
    update: {},
  });
}

export async function removeBoardMember(boardId: string, userId: string) {
  await prisma.boardMember.deleteMany({ where: { boardId, userId } });
}

// ── Column operations ─────────────────────────────────────────────────────────

export async function addColumn(boardId: string, name: string) {
  const last = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { order: "desc" },
  });
  return prisma.column.create({
    data: { name, boardId, order: (last?.order ?? -1) + 1 },
  });
}

export function renameColumn(id: string, name: string) {
  return prisma.column.update({ where: { id }, data: { name } });
}

export async function reorderColumns(orderedColumnIds: string[]) {
  await prisma.$transaction(
    orderedColumnIds.map((id, index) =>
      prisma.column.update({ where: { id }, data: { order: index } })
    )
  );
}

export async function deleteColumn(id: string) {
  const taskCount = await prisma.task.count({ where: { columnId: id } });
  if (taskCount > 0) {
    throw new HttpError(400, "Não é possível excluir uma coluna com tarefas. Mova ou exclua as tarefas primeiro.");
  }
  await prisma.column.delete({ where: { id } });
}

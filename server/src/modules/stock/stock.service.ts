import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

export type MovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

export async function listItems() {
  return prisma.stockItem.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function createItem(data: {
  name: string;
  category: string;
  unit: string;
  quantity?: number;
  minQuantity?: number;
  location?: string;
  notes?: string;
}) {
  return prisma.stockItem.create({ data });
}

export async function updateItem(
  id: string,
  data: {
    name?: string;
    category?: string;
    unit?: string;
    minQuantity?: number;
    location?: string;
    notes?: string;
  }
) {
  return prisma.stockItem.update({ where: { id }, data });
}

export async function deactivateItem(id: string) {
  return prisma.stockItem.update({ where: { id }, data: { active: false } });
}

export async function addMovement(
  itemId: string,
  userId: string,
  type: MovementType,
  quantity: number,
  notes?: string
) {
  if (quantity <= 0) throw new HttpError(400, "Quantidade deve ser maior que zero");

  const item = await prisma.stockItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) throw new HttpError(404, "Item não encontrado");

  const delta = type === "SAIDA" ? -quantity : quantity;

  if (type === "SAIDA" && item.quantity + delta < 0) {
    throw new HttpError(400, `Estoque insuficiente. Disponível: ${item.quantity} ${item.unit}`);
  }

  const [movement, updated] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: { itemId, userId, type, quantity: delta, notes },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.stockItem.update({
      where: { id: itemId },
      data: { quantity: { increment: delta } },
    }),
  ]);

  return { movement, item: updated };
}

export async function getMovements(itemId: string) {
  return prisma.stockMovement.findMany({
    where: { itemId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
}

export async function getRecentMovements() {
  return prisma.stockMovement.findMany({
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      item: { select: { id: true, name: true, unit: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

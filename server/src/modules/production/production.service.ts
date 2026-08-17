import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { createNotification } from "../notifications/notifications.service";

export type ProdStatus = "ARTE" | "IMPRESSAO" | "ACABAMENTO" | "ENTREGA" | "CONCLUIDO" | "CANCELADO";
export type ProdPriority = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";

const STATUS_ORDER: ProdStatus[] = ["ARTE", "IMPRESSAO", "ACABAMENTO", "ENTREGA", "CONCLUIDO"];

async function nextNumber(): Promise<number> {
  const last = await prisma.productionOrder.findFirst({ orderBy: { number: "desc" } });
  return (last?.number ?? 0) + 1;
}

export async function listOrders() {
  return prisma.productionOrder.findMany({
    where: { status: { not: "CANCELADO" } },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function createOrder(data: {
  title: string;
  clientName: string;
  priority?: ProdPriority;
  dueDate?: string | null;
  notes?: string | null;
  createdById: string;
}) {
  const number = await nextNumber();
  return prisma.productionOrder.create({
    data: {
      number,
      title: data.title,
      clientName: data.clientName,
      priority: data.priority ?? "NORMAL",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes ?? null,
      createdById: data.createdById,
    },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function updateOrder(
  id: string,
  data: {
    title?: string;
    clientName?: string;
    priority?: ProdPriority;
    dueDate?: string | null;
    notes?: string | null;
    status?: ProdStatus;
  }
) {
  const order = await prisma.productionOrder.findUnique({ where: { id } });
  if (!order) throw new HttpError(404, "Ordem não encontrada");

  return prisma.productionOrder.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.clientName !== undefined && { clientName: data.clientName }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(Object.prototype.hasOwnProperty.call(data, "dueDate") && {
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      }),
    },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function advanceOrder(id: string, actorId?: string) {
  const order = await prisma.productionOrder.findUnique({ where: { id } });
  if (!order) throw new HttpError(404, "Ordem não encontrada");

  const idx = STATUS_ORDER.indexOf(order.status as ProdStatus);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) {
    throw new HttpError(400, "Ordem já está na etapa final");
  }
  const nextStatus = STATUS_ORDER[idx + 1];

  const STAGE_LABELS: Record<string, string> = {
    IMPRESSAO: "Impressão", ACABAMENTO: "Acabamento", ENTREGA: "Entrega", CONCLUIDO: "Concluído",
  };

  const updated = await prisma.productionOrder.update({
    where: { id },
    data: { status: nextStatus },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  if (actorId && updated.createdById !== actorId) {
    createNotification(
      updated.createdById,
      "production_advance",
      `Ordem #${updated.number} avançou para ${STAGE_LABELS[nextStatus] ?? nextStatus}`,
      updated.title,
      "/producao"
    ).catch(() => {});
  }

  return updated;
}

export async function cancelOrder(id: string) {
  const order = await prisma.productionOrder.findUnique({ where: { id } });
  if (!order) throw new HttpError(404, "Ordem não encontrada");

  return prisma.productionOrder.update({
    where: { id },
    data: { status: "CANCELADO" },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function deleteOrder(id: string) {
  const order = await prisma.productionOrder.findUnique({ where: { id } });
  if (!order) throw new HttpError(404, "Ordem não encontrada");
  await prisma.productionOrder.delete({ where: { id } });
}

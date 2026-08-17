import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../db/prisma";

const ATTACHMENTS_DIR = path.join(__dirname, "../../../data/attachments/servicos");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function nextServiceNumber(): Promise<number> {
  const counter = await prisma.serviceOrderCounter.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", next: 2 },
    update: { next: { increment: 1 } },
  });
  return counter.next - 1;
}

export async function listServices(status?: string) {
  const where = status ? { status } : {};
  const services = await prisma.serviceOrder.findMany({
    where,
    include: {
      items: { orderBy: { itemOrder: "asc" } },
      createdByUser: { select: { id: true, name: true, avatarUrl: true } },
      developerUser: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: [{ status: "asc" }, { queuePosition: "asc" }, { createdAt: "desc" }],
  });

  return services.map(deserializeService);
}

export async function getServiceById(id: string) {
  const svc = await prisma.serviceOrder.findUniqueOrThrow({
    where: { id },
    include: {
      items: { orderBy: { itemOrder: "asc" } },
      logs: { orderBy: { createdAt: "desc" }, take: 100 },
      createdByUser: { select: { id: true, name: true, avatarUrl: true } },
      developerUser: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  return deserializeServiceFull(svc);
}

export async function listLogs() {
  const logs = await prisma.serviceOrderLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return logs.map((l) => ({ ...l, actor: JSON.parse(l.actor), details: JSON.parse(l.details) }));
}

interface CreateServiceInput {
  name: string;
  type: string;
  orderDate: string;
  seller: string;
  requester: string;
  items: Array<{ name: string; rollSizes: string[]; notes: string }>;
  actorId: string;
  actorName: string;
}

export async function createService(input: CreateServiceInput) {
  const { name, type, orderDate, seller, requester, items, actorId, actorName } = input;

  const serviceNumber = await nextServiceNumber();

  const openCount = await prisma.serviceOrder.count({ where: { status: "open" } });
  const queuePosition = openCount + 1;

  const svc = await prisma.serviceOrder.create({
    data: {
      serviceNumber,
      name,
      type,
      orderDate,
      seller,
      requester,
      status: "open",
      queuePosition,
      createdByUserId: actorId,
      items: {
        create: items.map((item, idx) => ({
          name: item.name,
          rollSizes: JSON.stringify(item.rollSizes ?? []),
          notes: item.notes ?? "",
          itemOrder: idx,
        })),
      },
    },
    include: {
      items: { orderBy: { itemOrder: "asc" } },
      createdByUser: { select: { id: true, name: true, avatarUrl: true } },
      developerUser: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  await prisma.serviceOrderLog.create({
    data: {
      serviceOrderId: svc.id,
      action: "created",
      summary: `Serviço #${serviceNumber} criado`,
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify({ name, type }),
    },
  });

  return deserializeService(svc);
}

interface UpdateServiceInput {
  name?: string;
  type?: string;
  orderDate?: string;
  seller?: string;
  requester?: string;
  items?: Array<{ name: string; rollSizes: string[]; notes: string }>;
  actorId: string;
  actorName: string;
}

export async function updateService(id: string, input: UpdateServiceInput) {
  const { actorId, actorName, items, ...fields } = input;

  const existing = await prisma.serviceOrder.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "open") {
    throw Object.assign(new Error("Apenas serviços abertos podem ser editados"), { statusCode: 400 });
  }

  const svc = await prisma.$transaction(async (tx) => {
    if (items !== undefined) {
      await tx.serviceOrderItem.deleteMany({ where: { serviceOrderId: id } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: id,
            name: it.name,
            rollSizes: JSON.stringify(it.rollSizes ?? []),
            notes: it.notes ?? "",
            itemOrder: i,
          },
        });
      }
    }

    return tx.serviceOrder.update({
      where: { id },
      data: fields,
      include: {
        items: { orderBy: { itemOrder: "asc" } },
        createdByUser: { select: { id: true, name: true, avatarUrl: true } },
        developerUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  });

  await prisma.serviceOrderLog.create({
    data: {
      serviceOrderId: id,
      action: "updated",
      summary: `Serviço #${existing.serviceNumber} atualizado`,
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify(fields),
    },
  });

  return deserializeService(svc);
}

interface ChangeStatusInput {
  newStatus: "open" | "development" | "done" | "deleted";
  developerUserId?: string;
  completionMessage?: string;
  itemCompletions?: Array<{ id: string; completed: boolean; completionNote: string }>;
  deletedReason?: string;
  actorId: string;
  actorName: string;
}

export async function changeStatus(id: string, input: ChangeStatusInput) {
  const { newStatus, developerUserId, completionMessage, itemCompletions, deletedReason, actorId, actorName } = input;

  const existing = await prisma.serviceOrder.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  });

  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === "development") {
    if (!developerUserId) throw Object.assign(new Error("developerUserId obrigatório"), { statusCode: 400 });
    updateData.developerUserId = developerUserId;
    updateData.queuePosition = null;
  }

  if (newStatus === "done") {
    updateData.completedAt = new Date();
    updateData.completionMessage = completionMessage ?? "";
    updateData.queuePosition = null;

    if (itemCompletions && itemCompletions.length > 0) {
      for (const ic of itemCompletions) {
        await prisma.serviceOrderItem.update({
          where: { id: ic.id },
          data: { completed: ic.completed, completionNote: ic.completionNote ?? "" },
        });
      }
    }
  }

  if (newStatus === "deleted") {
    updateData.deletedReason = deletedReason ?? "";
    updateData.deletedAt = new Date();
    updateData.queuePosition = null;
  }

  if (newStatus === "open" && existing.status !== "open") {
    // Reopen — put back at end of queue
    const openCount = await prisma.serviceOrder.count({ where: { status: "open" } });
    updateData.queuePosition = openCount + 1;
    updateData.completedAt = null;
    updateData.completionMessage = null;
    updateData.deletedAt = null;
    updateData.deletedReason = null;
    updateData.developerUserId = null;
  }

  const svc = await prisma.serviceOrder.update({
    where: { id },
    data: updateData as Parameters<typeof prisma.serviceOrder.update>[0]["data"],
    include: {
      items: { orderBy: { itemOrder: "asc" } },
      createdByUser: { select: { id: true, name: true, avatarUrl: true } },
      developerUser: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const actionLabels: Record<string, unknown> = {
    development: "Em desenvolvimento",
    done: "Concluído",
    deleted: "Excluído",
    open: "Reaberto",
  };

  await prisma.serviceOrderLog.create({
    data: {
      serviceOrderId: id,
      action: `status:${newStatus}`,
      summary: `Serviço #${existing.serviceNumber} — ${actionLabels[newStatus] ?? newStatus}`,
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify({ from: existing.status, to: newStatus }),
    },
  });

  return deserializeService(svc);
}

export async function reorderQueue(orderedIds: string[], actorId: string, actorName: string) {
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.serviceOrder.update({ where: { id }, data: { queuePosition: idx + 1 } })
    )
  );

  await prisma.serviceOrderLog.create({
    data: {
      action: "queue:reorder",
      summary: "Fila de serviços reordenada",
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify({ count: orderedIds.length }),
    },
  });
}

interface UploadAttachmentInput {
  serviceId: string;
  itemId?: string;
  fileName: string;
  dataUrl: string;
  type: "service" | "completion";
  actorId: string;
  actorName: string;
}

export async function uploadAttachment(input: UploadAttachmentInput) {
  const { serviceId, itemId, fileName, dataUrl, type, actorId, actorName } = input;

  const svc = await prisma.serviceOrder.findUniqueOrThrow({
    where: { id: serviceId },
    include: { items: true },
  });

  const dir = path.join(ATTACHMENTS_DIR, String(svc.serviceNumber));
  await ensureDir(dir);

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}_${safeFileName}`;
  const filePath = path.join(dir, unique);

  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));

  const publicUrl = `/attachments/servicos/${svc.serviceNumber}/${unique}`;

  if (itemId) {
    const item = svc.items.find((i) => i.id === itemId);
    if (!item) throw Object.assign(new Error("Item não encontrado"), { statusCode: 404 });

    const field = type === "completion" ? "completionAttachments" : "attachments";
    const raw = (item as Record<string, unknown>)[field];
    const existing: string[] = JSON.parse(typeof raw === "string" ? raw : "[]");
    existing.push(publicUrl);

    await prisma.serviceOrderItem.update({
      where: { id: itemId },
      data: { [field]: JSON.stringify(existing) },
    });
  } else {
    // No item target — service-level attachment stored in log
    await prisma.serviceOrderLog.create({
      data: {
        serviceOrderId: serviceId,
        action: "attachment:added",
        summary: `Arquivo ${safeFileName} adicionado`,
        actor: JSON.stringify({ id: actorId, name: actorName }),
        details: JSON.stringify({ url: publicUrl, fileName: safeFileName }),
      },
    });
  }

  await prisma.serviceOrderLog.create({
    data: {
      serviceOrderId: serviceId,
      action: "attachment:upload",
      summary: `Arquivo ${safeFileName} enviado`,
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify({ url: publicUrl }),
    },
  });

  return { url: publicUrl };
}

export async function deleteAttachment(
  serviceId: string,
  itemId: string,
  attachmentUrl: string,
  type: "service" | "completion",
  actorId: string,
  actorName: string
) {
  const svc = await prisma.serviceOrder.findUniqueOrThrow({
    where: { id: serviceId },
    include: { items: true },
  });

  const item = svc.items.find((i) => i.id === itemId);
  if (!item) throw Object.assign(new Error("Item não encontrado"), { statusCode: 404 });

  const field = type === "completion" ? "completionAttachments" : "attachments";
  const raw2 = (item as Record<string, unknown>)[field];
  const existing: string[] = JSON.parse(typeof raw2 === "string" ? raw2 : "[]");
  const updated = existing.filter((u) => u !== attachmentUrl);

  await prisma.serviceOrderItem.update({
    where: { id: itemId },
    data: { [field]: JSON.stringify(updated) },
  });

  // Try to remove the actual file
  try {
    const fileName = path.basename(attachmentUrl);
    const filePath = path.join(ATTACHMENTS_DIR, String(svc.serviceNumber), fileName);
    await fs.unlink(filePath);
  } catch {
    // ignore if file doesn't exist
  }

  await prisma.serviceOrderLog.create({
    data: {
      serviceOrderId: serviceId,
      action: "attachment:deleted",
      summary: `Arquivo removido`,
      actor: JSON.stringify({ id: actorId, name: actorName }),
      details: JSON.stringify({ url: attachmentUrl }),
    },
  });
}

// ─── Serialization helpers ────────────────────────────────────────────────────

type ServiceWithItems = Awaited<ReturnType<typeof prisma.serviceOrder.findUniqueOrThrow>> & {
  items: Array<{
    id: string;
    name: string;
    rollSizes: string;
    notes: string;
    completed: boolean;
    completionNote: string;
    attachments: string;
    completionAttachments: string;
    itemOrder: number;
    serviceOrderId: string;
  }>;
  createdByUser: { id: string; name: string; avatarUrl: string | null } | null;
  developerUser: { id: string; name: string; avatarUrl: string | null } | null;
};

function deserializeService(svc: ServiceWithItems) {
  return {
    ...svc,
    items: svc.items.map((item) => ({
      ...item,
      rollSizes: JSON.parse(item.rollSizes) as string[],
      attachments: JSON.parse(item.attachments) as string[],
      completionAttachments: JSON.parse(item.completionAttachments) as string[],
    })),
  };
}

type ServiceWithLogs = ServiceWithItems & {
  logs: Array<{
    id: string;
    action: string;
    summary: string;
    actor: string;
    details: string;
    createdAt: Date;
    serviceOrderId: string | null;
  }>;
};

function deserializeServiceFull(svc: ServiceWithLogs) {
  return {
    ...deserializeService(svc),
    logs: svc.logs.map((l) => ({
      ...l,
      actor: JSON.parse(l.actor) as { id: string; name: string },
      details: JSON.parse(l.details) as Record<string, unknown>,
    })),
  };
}

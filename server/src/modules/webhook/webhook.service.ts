import { prisma } from "../../db/prisma";
import { createNotification } from "../notifications/notifications.service";

function normalize(v?: string | null) {
  return v ? v.trim().toLowerCase() : "";
}

export async function ingestLead(data: {
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  source?: string | null;
}) {
  // Find or create contact (deduplicate by email or phone)
  let contact = null;
  const email = normalize(data.email);
  const phone = normalize(data.phone);

  if (email) {
    contact = await prisma.contact.findFirst({ where: { email } });
  }
  if (!contact && phone) {
    contact = await prisma.contact.findFirst({ where: { phone } });
  }
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        notes: data.message?.trim() || null,
      },
    });
  }

  // First CRM stage
  const firstStage = await prisma.crmStage.findFirst({
    where: { isClosed: false },
    orderBy: { order: "asc" },
  });
  if (!firstStage) return { contact, deal: null };

  // System ADMIN as owner/creator
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) return { contact, deal: null };

  const last = await prisma.deal.findFirst({
    where: { stageId: firstStage.id },
    orderBy: { order: "desc" },
  });

  const sourceLabel = data.source?.trim() ? ` (${data.source.trim()})` : " (Site)";
  const deal = await prisma.deal.create({
    data: {
      title: `${data.name.trim()}${sourceLabel}`,
      contactId: contact.id,
      stageId: firstStage.id,
      value: 0,
      notes: data.message?.trim() || null,
      company: "GRAFINORTE",
      ownerId: adminUser.id,
      createdById: adminUser.id,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true, title: true },
  });

  // Notify all ADMIN/COMERCIAL users
  const recipients = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "COMERCIAL"] } },
    select: { id: true },
  });
  for (const u of recipients) {
    createNotification(
      u.id,
      "NEW_LEAD",
      `Novo lead: ${data.name.trim()}`,
      data.message?.slice(0, 80) || data.email || data.phone || "Sem mensagem",
      `/comercial/deals/${deal.id}`
    ).catch(() => {});
  }

  return { contact, deal };
}

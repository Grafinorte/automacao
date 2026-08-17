/**
 * Migração: SISTEMA DE SERVIÇO SEM O.S → SQLite (Prisma)
 *
 * Uso: node scripts/migrate-servicos.js
 */

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../server/src/generated/prisma/client.js");

const prisma = new PrismaClient();

const JSON_PATH = path.join(__dirname, "../SISTEMA DE SERVIÇO SEM O.S/db/servicos.json");
const OLD_ATTACHMENTS = path.join(__dirname, "../SISTEMA DE SERVIÇO SEM O.S/serviços");
const NEW_ATTACHMENTS = path.join(__dirname, "../server/data/attachments/servicos");

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, "utf-8");
  const services = JSON.parse(raw);

  console.log(`Migrando ${services.length} serviços...`);

  // Initialize counter to one past max service number
  const maxNum = services.reduce((m, s) => Math.max(m, s.serviceNumber ?? 0), 0);
  await prisma.serviceOrderCounter.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", next: maxNum + 1 },
    update: { next: maxNum + 1 },
  });

  for (const svc of services) {
    const serviceNumber = svc.serviceNumber ?? svc.id;

    // Map status
    const statusMap = {
      "open": "open",
      "development": "development",
      "done": "done",
      "deleted": "deleted",
    };
    const status = statusMap[svc.status] ?? "open";

    const existing = await prisma.serviceOrder.findFirst({
      where: { serviceNumber: Number(serviceNumber) },
    });
    if (existing) {
      console.log(`  Skipping #${serviceNumber} (already migrated)`);
      continue;
    }

    const order = await prisma.serviceOrder.create({
      data: {
        serviceNumber: Number(serviceNumber),
        name: svc.name ?? "Sem nome",
        type: svc.type ?? "Outros",
        orderDate: svc.orderDate ?? svc.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        seller: svc.seller ?? "",
        requester: svc.requester ?? "",
        status,
        queuePosition: status === "open" ? (svc.queuePosition ?? null) : null,
        completedAt: svc.completedAt ? new Date(svc.completedAt) : null,
        completionMessage: svc.completionMessage ?? null,
        deletedReason: svc.deletedReason ?? null,
        deletedAt: svc.deletedAt ? new Date(svc.deletedAt) : null,
        createdByUserId: (await getOrCreateSystemUser()).id,
        createdAt: svc.createdAt ? new Date(svc.createdAt) : new Date(),
      },
    });

    // Items
    const items = Array.isArray(svc.items) ? svc.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // Map attachments — they may reference paths like "serviços/NUMBER/filename"
      const mapUrls = (arr) => {
        if (!Array.isArray(arr)) return "[]";
        return JSON.stringify(arr.map((u) => {
          // Try to convert old path to new public URL
          const match = String(u).match(/(\d+)\/([^/]+)$/);
          if (match) return `/attachments/servicos/${match[1]}/${match[2]}`;
          return u;
        }));
      };

      await prisma.serviceOrderItem.create({
        data: {
          serviceOrderId: order.id,
          name: it.name ?? "Item",
          rollSizes: JSON.stringify(Array.isArray(it.rollSizes) ? it.rollSizes : []),
          notes: it.notes ?? "",
          completed: Boolean(it.completed),
          completionNote: it.completionNote ?? "",
          attachments: mapUrls(it.attachments),
          completionAttachments: mapUrls(it.completionAttachments),
          itemOrder: i,
        },
      });
    }

    // Logs
    const logs = Array.isArray(svc.logs) ? svc.logs : [];
    for (const log of logs) {
      await prisma.serviceOrderLog.create({
        data: {
          serviceOrderId: order.id,
          action: log.action ?? "legacy",
          summary: log.summary ?? log.message ?? "Log migrado",
          actor: JSON.stringify(log.actor ?? { id: "system", name: "Sistema" }),
          details: JSON.stringify(log.details ?? {}),
          createdAt: log.createdAt ? new Date(log.createdAt) : new Date(),
        },
      });
    }

    console.log(`  ✓ #${serviceNumber} — ${svc.name}`);
  }

  // Copy attachment files
  console.log("\nCopiando arquivos de anexo...");
  copyDirSync(OLD_ATTACHMENTS, NEW_ATTACHMENTS);
  console.log("  ✓ Arquivos copiados para server/data/attachments/servicos/");

  console.log("\n✅ Migração concluída!");
}

let _systemUser = null;
async function getOrCreateSystemUser() {
  if (_systemUser) return _systemUser;
  let user = await prisma.user.findFirst({ where: { email: "sistema@grafinorte.com.br" } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  }
  if (!user) {
    throw new Error("Nenhum usuário ADMIN encontrado. Crie um admin antes de migrar.");
  }
  _systemUser = user;
  return user;
}

main()
  .catch((e) => { console.error("❌ Erro na migração:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

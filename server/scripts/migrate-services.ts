/**
 * Importa serviços históricos do sistema antigo (JSON) para o banco Prisma.
 * Execute: npx ts-node -e "require('./scripts/migrate-services.ts')"
 * Ou via npm script: npm run migrate:services
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OLD_DB_PATH = path.resolve(__dirname, "../../SISTEMA DE SERVIÇO SEM O.S/db/servicos.json");
const OLD_FILES_BASE = path.resolve(__dirname, "../../SISTEMA DE SERVIÇO SEM O.S/serviços");
const NEW_ATTACHMENTS_BASE = path.resolve(__dirname, "../data/attachments/servicos");

interface OldAttachment {
  name: string;
  originalName?: string;
  type?: string;
  size?: number;
  kind?: string;
  savedAt?: string;
  folder?: string;
  url?: string;
  uploadedBy?: { id: string; username: string; displayName: string; role: string };
  itemId?: string;
  scope?: string;
}

interface OldItem {
  id: string;
  name: string;
  rollSizes?: string[];
  notes?: string;
  attachments?: OldAttachment[];
  completionAttachments?: OldAttachment[];
  completed?: boolean;
  completionNote?: string;
}

interface OldLog {
  id: string;
  timestamp: string;
  action: string;
  summary: string;
  actor?: { id: string; username?: string; displayName?: string; role?: string };
  details?: Record<string, unknown>;
}

interface OldService {
  id: string;
  folder?: string;
  name: string;
  type: string;
  orderDate: string;
  createdAt?: string;
  updatedAt?: string;
  requester?: string;
  seller?: string;
  source?: string;
  notes?: string;
  developer?: string;
  deletedReason?: string;
  deletedAt?: string;
  completedAt?: string;
  completionMessage?: string;
  attachments?: OldAttachment[];
  status: string;
  queuePosition?: number | null;
  serviceNumber: number;
  createdBy?: unknown;
  logs?: OldLog[];
  items?: OldItem[];
  requesterAccount?: unknown;
  developerAccount?: unknown;
}

function fixEncoding(str: string | null | undefined): string {
  if (!str) return "";
  // The JSON was saved as UTF-8 but PowerShell mangled display; actual file is fine
  return str;
}

function copyFileIfExists(srcPath: string, destPath: string): boolean {
  try {
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=== Migração de Serviços Históricos ===\n");

  // Load existing service numbers to skip duplicates
  const existingNumbers = new Set(
    (await prisma.serviceOrder.findMany({ select: { serviceNumber: true } })).map((s) => s.serviceNumber)
  );
  console.log(`Já existem ${existingNumbers.size} serviços no banco. Importando apenas os que faltam.\n`);

  // Read old JSON
  const raw = fs.readFileSync(OLD_DB_PATH, "utf-8");
  const data = JSON.parse(raw) as { services: OldService[] };
  const services = data.services.sort((a, b) => a.serviceNumber - b.serviceNumber);
  console.log(`Encontrados ${services.length} serviços para importar.\n`);

  // Find admin user
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminUser) throw new Error("Nenhum usuário ADMIN encontrado. Execute o seed primeiro.");

  // Map developer names to user IDs
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true } });
  const userByName = (name: string): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    const found = allUsers.find(
      (u) => u.name.toLowerCase().includes(lower) || lower.includes(u.name.toLowerCase().split(" ")[0].toLowerCase())
    );
    return found?.id ?? null;
  };

  // Status mapping: old → new (same values, just normalize)
  const statusMap: Record<string, string> = {
    open: "open",
    development: "development",
    done: "done",
    deleted: "deleted",
  };

  let imported = 0;
  let skippedFiles = 0;
  let copiedFiles = 0;

  for (const svc of services) {
    if (existingNumbers.has(svc.serviceNumber)) {
      // Still copy attachment files for existing services
      for (const item of svc.items ?? []) {
        for (const att of [...(item.completionAttachments ?? []), ...(item.attachments ?? [])]) {
          if (!att.name) continue;
          const folderPart = svc.folder
            ? svc.folder.replace(/^servi[çc]os\//, "").replace(/^servi[çc]os\\/, "")
            : String(svc.serviceNumber).padStart(4, "0");
          const srcPath = path.join(OLD_FILES_BASE, folderPart, att.name);
          const destPath = path.join(NEW_ATTACHMENTS_BASE, String(svc.serviceNumber), att.name);
          if (!fs.existsSync(destPath)) {
            const copied = copyFileIfExists(srcPath, destPath);
            if (copied) copiedFiles++;
            else {
              const copiedRoot = copyFileIfExists(path.join(OLD_FILES_BASE, att.name), destPath);
              if (copiedRoot) copiedFiles++; else skippedFiles++;
            }
          }
        }
      }
      continue;
    }

    const status = statusMap[svc.status] ?? "done";
    const developerUserId = svc.developer ? userByName(svc.developer) : null;

    // Process items — build new completionAttachment URL strings
    const items: {
      name: string;
      rollSizes: string;
      notes: string;
      completed: boolean;
      completionNote: string;
      attachments: string;
      completionAttachments: string;
      itemOrder: number;
    }[] = (svc.items ?? []).map((item, idx) => {
      // Copy and remap completion attachments
      const newCompletionUrls: string[] = [];
      for (const att of item.completionAttachments ?? []) {
        if (!att.name) continue;
        // Source: SISTEMA DE SERVIÇO SEM O.S/serviços/{folder}/{filename}
        // folder might be "serviços/0023" or just "0023"
        const folderPart = svc.folder
          ? svc.folder.replace(/^servi[çc]os\//, "").replace(/^servi[çc]os\\/, "")
          : String(svc.serviceNumber).padStart(4, "0");
        const srcPath = path.join(OLD_FILES_BASE, folderPart, att.name);
        const destPath = path.join(NEW_ATTACHMENTS_BASE, String(svc.serviceNumber), att.name);
        const newUrl = `/attachments/servicos/${svc.serviceNumber}/${att.name}`;

        const copied = copyFileIfExists(srcPath, destPath);
        if (copied) {
          copiedFiles++;
          newCompletionUrls.push(newUrl);
        } else {
          // File not found in numbered folder — try root of serviços
          const srcRoot = path.join(OLD_FILES_BASE, att.name);
          const copiedRoot = copyFileIfExists(srcRoot, destPath);
          if (copiedRoot) {
            copiedFiles++;
            newCompletionUrls.push(newUrl);
          } else {
            skippedFiles++;
            // Still record the URL so we know the attachment was there
            newCompletionUrls.push(newUrl);
          }
        }
      }

      const newAttUrls: string[] = [];
      for (const att of item.attachments ?? []) {
        if (!att.name) continue;
        const folderPart = svc.folder
          ? svc.folder.replace(/^servi[çc]os\//, "").replace(/^servi[çc]os\\/, "")
          : String(svc.serviceNumber).padStart(4, "0");
        const srcPath = path.join(OLD_FILES_BASE, folderPart, att.name);
        const destPath = path.join(NEW_ATTACHMENTS_BASE, String(svc.serviceNumber), att.name);
        const newUrl = `/attachments/servicos/${svc.serviceNumber}/${att.name}`;
        const copied = copyFileIfExists(srcPath, destPath);
        if (copied) { copiedFiles++; newAttUrls.push(newUrl); }
      }

      return {
        name: fixEncoding(item.name),
        rollSizes: JSON.stringify(item.rollSizes ?? []),
        notes: fixEncoding(item.notes),
        completed: item.completed ?? false,
        completionNote: fixEncoding(item.completionNote),
        attachments: JSON.stringify(newAttUrls),
        completionAttachments: JSON.stringify(newCompletionUrls),
        itemOrder: idx,
      };
    });

    // Create service order (skip auto-increment, set serviceNumber directly)
    const created = await prisma.serviceOrder.create({
      data: {
        serviceNumber: svc.serviceNumber,
        name: fixEncoding(svc.name),
        type: fixEncoding(svc.type),
        orderDate: svc.orderDate ?? svc.createdAt?.split("T")[0] ?? "2026-01-01",
        seller: fixEncoding(svc.seller),
        requester: fixEncoding(svc.requester),
        status,
        queuePosition: status === "open" ? (svc.queuePosition ?? null) : null,
        completedAt: svc.completedAt ? new Date(svc.completedAt) : null,
        completionMessage: fixEncoding(svc.completionMessage),
        deletedReason: fixEncoding(svc.deletedReason),
        deletedAt: svc.deletedAt ? new Date(svc.deletedAt) : null,
        developerUserId,
        createdByUserId: adminUser.id,
        createdAt: svc.createdAt ? new Date(svc.createdAt) : new Date(),
        updatedAt: svc.updatedAt ? new Date(svc.updatedAt) : new Date(),
        items: { create: items },
      },
    });

    // Import logs
    for (const log of svc.logs ?? []) {
      await prisma.serviceOrderLog.create({
        data: {
          serviceOrderId: created.id,
          action: log.action,
          summary: fixEncoding(log.summary),
          actor: JSON.stringify({
            id: log.actor?.id ?? adminUser.id,
            name: log.actor?.displayName ?? log.actor?.username ?? "Importado",
          }),
          details: JSON.stringify(log.details ?? {}),
          createdAt: log.timestamp ? new Date(log.timestamp) : new Date(),
        },
      });
    }

    imported++;
    if (imported % 10 === 0) console.log(`  Importados: ${imported}/${services.length}`);
  }

  // Update counter to max+1
  const maxNumber = Math.max(...services.map((s) => s.serviceNumber));
  await prisma.serviceOrderCounter.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", next: maxNumber + 1 },
    update: { next: maxNumber + 1 },
  });

  console.log(`\n✓ Importados: ${imported} serviços`);
  console.log(`✓ Arquivos copiados: ${copiedFiles}`);
  if (skippedFiles > 0) console.log(`⚠ Arquivos não encontrados: ${skippedFiles}`);
  console.log(`✓ Contador atualizado para: ${maxNumber + 1}`);
  console.log("\nMigração concluída!");
}

main()
  .catch((e) => { console.error("Erro na migração:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

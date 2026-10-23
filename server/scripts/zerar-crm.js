// Zera o CRM para a equipe começar do zero: apaga negócios, anotações (histórico) e contatos do CRM.
// Mantém: etapas do funil, usuários, orçamentos e conversas do WhatsApp (só desfaz o vínculo com o CRM).
//
// Uso (na pasta server, com o build feito):
//   node scripts/zerar-crm.js              -> apenas mostra o que seria apagado (nada é alterado)
//   node scripts/zerar-crm.js --confirmar  -> faz backup do banco e apaga
const fs = require("fs");
const path = require("path");
const { prisma } = require("../dist/db/prisma");

// Data da importação do RD Station (CSVs de 23/07/2026)
const IMPORT_CUTOFF = new Date("2026-07-24T00:00:00.000Z");

async function main() {
  const confirm = process.argv.includes("--confirmar");

  const [contacts, deals, activities, dealsImported, contactsImported, waLinked] = await Promise.all([
    prisma.contact.count(),
    prisma.deal.count(),
    prisma.dealActivity.count(),
    prisma.deal.count({ where: { createdAt: { lt: IMPORT_CUTOFF } } }),
    prisma.contact.count({ where: { createdAt: { lt: IMPORT_CUTOFF } } }),
    prisma.waContact.count({ where: { crmContactId: { not: null } } }),
  ]);

  console.log("CRM atual:");
  console.log(`  Negócios:  ${deals}  (até a importação: ${dealsImported} | criados depois: ${deals - dealsImported})`);
  console.log(`  Contatos:  ${contacts}  (até a importação: ${contactsImported} | criados depois: ${contacts - contactsImported})`);
  console.log(`  Anotações: ${activities}`);
  console.log(`  Conversas do WhatsApp vinculadas ao CRM: ${waLinked} (serão mantidas, só perdem o vínculo)`);

  if (!confirm) {
    console.log("\nNada foi apagado. Para apagar de verdade, rode: node scripts/zerar-crm.js --confirmar");
    return;
  }

  const backupDir = path.join(__dirname, "../data/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `antes-de-zerar-crm-${stamp}.db`);
  // VACUUM INTO gera uma cópia consistente mesmo com o sistema rodando
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  console.log(`\nBackup salvo em: ${backupPath}`);

  const result = await prisma.$transaction([
    prisma.dealActivity.deleteMany({}),
    prisma.deal.deleteMany({}),
    prisma.contact.deleteMany({}),
    prisma.waContact.updateMany({ where: { crmContactId: { not: null } }, data: { crmContactId: null } }),
  ]);

  console.log("CRM zerado:");
  console.log(`  Anotações apagadas: ${result[0].count}`);
  console.log(`  Negócios apagados:  ${result[1].count}`);
  console.log(`  Contatos apagados:  ${result[2].count}`);
  console.log(`  Conversas do WhatsApp desvinculadas: ${result[3].count}`);
}

main()
  .catch((err) => {
    console.error("Erro:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

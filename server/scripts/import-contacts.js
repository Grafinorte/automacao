// Import contacts from RD Station CSV export
const fs = require("fs");
const path = require("path");
const { prisma } = require("../dist/db/prisma");

const CSV_PATH = path.join(__dirname, "../../arquivos/contato_export_2026-07-23_09_05.csv");

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  // Skip "sep=," line and header
  const dataLines = lines.filter(
    (l, i) => i > 0 && !l.startsWith("sep=") && !l.startsWith("Nome,")
  );

  console.log(`📋 ${dataLines.length} contatos encontrados no CSV`);

  // Delete all existing contacts (user confirmed they deleted old ones)
  const deleted = await prisma.contact.deleteMany({});
  console.log(`🗑  ${deleted.count} contatos antigos removidos`);

  let created = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    // Nome,Empresa,Cargo,Email,Telefone,...
    const name    = cols[0]?.replace(/^["']|["']$/g, "").trim();
    const company = cols[1]?.replace(/^["']|["']$/g, "").trim() || null;
    const email   = cols[3]?.replace(/^["']|["']$/g, "").trim() || null;
    const phone   = normalizePhone(cols[4]);

    if (!name) { skipped++; continue; }

    try {
      await prisma.contact.create({
        data: {
          name,
          company: company || null,
          email: email || null,
          phone: phone || null,
        },
      });
      created++;
    } catch (e) {
      // Skip duplicates or constraint errors
      skipped++;
    }
  }

  console.log(`✅ ${created} contatos importados`);
  if (skipped > 0) console.log(`⚠  ${skipped} ignorados (sem nome ou duplicados)`);
}

main()
  .catch((e) => { console.error("Erro:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

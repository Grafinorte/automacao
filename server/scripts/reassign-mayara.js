const fs = require("fs");
const path = require("path");
const { prisma } = require("../dist/db/prisma");

const CSV_PATH = path.join(__dirname, "../../arquivos/negociação export_2026-07-23_09_03.csv");

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function clean(s) { return (s || "").replace(/^"+|"+$/g, "").trim(); }

async function main() {
  // Find Miguel
  const miguel = await prisma.user.findFirst({ where: { name: { contains: "Miguel" } } });
  if (!miguel) { console.error("❌ Usuário Miguel não encontrado."); process.exit(1); }
  console.log(`👤 Reatribuindo para: ${miguel.name} (${miguel.id})`);

  // Read CSV and collect titles where Responsável = Mayara Amaral
  let raw = fs.readFileSync(CSV_PATH, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.filter(l => !l.startsWith("sep=") && !l.startsWith("Nome,"));

  const titles = [];
  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    const title = clean(cols[0]);
    const responsavel = clean(cols[23]);
    if (title && responsavel === "Mayara Amaral") titles.push(title);
  }
  console.log(`📋 ${titles.length} deals da Mayara encontrados no CSV`);

  // Update each deal by title
  let updated = 0;
  let notFound = 0;
  for (const title of titles) {
    const result = await prisma.deal.updateMany({
      where: { title },
      data: { ownerId: miguel.id },
    });
    if (result.count > 0) { updated += result.count; }
    else { console.log(`  ⚠  Não encontrado no banco: "${title}"`); notFound++; }
  }

  console.log(`✅ ${updated} deals reatribuídos para ${miguel.name}`);
  if (notFound > 0) console.log(`⚠  ${notFound} não encontrados no banco`);
}

main()
  .catch(e => { console.error("Erro:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

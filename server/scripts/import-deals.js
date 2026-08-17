// Import deals from RD Station CSV export and link to contacts + users
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

function parseDate(s) {
  if (!s || !s.trim()) return null;
  const parts = s.trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function clean(s) {
  return (s || "").replace(/^"+|"+$/g, "").trim();
}

function norm(s) {
  return (s || "").toLowerCase().trim();
}

// Map RD Station stage names → our CRM stage names
const STAGE_MAP = {
  "prospecção":              "novo lead",
  "contato":                 "novo lead",
  "lead frio":               "novo lead",
  "lead quente":             "novo lead",
  "qualificação":            "qualificado",
  "aguardando orçamento":    "proposta enviada",
  "orçamento enviado":       "proposta enviada",
  "fechado / em transporte": "negociação",
  "finalizado / entregue":   "ganho",
  "perdido":                 "perdido",
};

function resolveStage(etapa, estado, stageByName) {
  // Estado overrides: closed deals go to Ganho or Perdido
  if (estado === "Vendida") return stageByName["ganho"] || null;
  if (estado === "Perdida") return stageByName["perdido"] || null;

  // Direct match first
  const direct = stageByName[norm(etapa)];
  if (direct) return direct;

  // Mapped match
  const mapped = STAGE_MAP[norm(etapa)];
  if (mapped) return stageByName[mapped] || null;

  return null;
}

function findUser(responsavel, userByName, adminUser) {
  if (!responsavel) return adminUser;
  const n = norm(responsavel);
  // Exact match
  if (userByName[n]) return userByName[n];
  // Partial: CSV name contains DB name or DB name contains CSV name
  for (const [key, u] of Object.entries(userByName)) {
    if (n.includes(key) || key.includes(n)) return u;
    // Match first+last name loosely
    const csvParts = n.split(" ").filter(Boolean);
    const dbParts  = key.split(" ").filter(Boolean);
    if (csvParts[0] === dbParts[0] && csvParts[csvParts.length - 1] === dbParts[dbParts.length - 1]) return u;
    if (csvParts[0] === dbParts[0]) return u; // same first name
  }
  return null;
}

async function main() {
  // Load stages
  const stages = await prisma.crmStage.findMany({ orderBy: { order: "asc" } });
  if (stages.length === 0) {
    console.error("❌ Nenhum estágio CRM encontrado. Abra o CRM no sistema primeiro.");
    process.exit(1);
  }
  const stageByName = {};
  for (const s of stages) stageByName[norm(s.name)] = s;
  console.log(`📊 Estágios: ${stages.map((s) => s.name).join(" | ")}`);

  // Load users
  const users = await prisma.user.findMany({ where: { isActive: true } });
  const userByName = {};
  for (const u of users) userByName[norm(u.name)] = u;
  const adminUser = users.find((u) => u.role === "ADMIN") || users[0];
  console.log(`👤 Usuários: ${users.map((u) => u.name).join(", ")}`);

  // Load contacts (indexed by normalised name, keep first match)
  const contacts = await prisma.contact.findMany();
  const contactByName = {};
  for (const c of contacts) {
    const key = norm(c.name);
    if (!contactByName[key]) contactByName[key] = c;
  }
  console.log(`👥 Contatos carregados: ${contacts.length}`);

  // Parse CSV
  let raw = fs.readFileSync(CSV_PATH, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.filter(
    (l) => !l.startsWith("sep=") && !l.startsWith("Nome,") && l.trim() !== ""
  );
  console.log(`\n📋 ${dataLines.length} linhas de negócio no CSV`);

  // Delete all existing deals
  const { count: deleted } = await prisma.deal.deleteMany({});
  console.log(`🗑  ${deleted} negócios antigos removidos\n`);

  const stageOrderCounters = {};
  let created = 0;
  let skipped = 0;
  const unknownStages = new Set();
  const unknownOwners = new Set();

  for (const line of dataLines) {
    const cols = parseCSVLine(line);

    const title = clean(cols[0]);
    if (!title) { skipped++; continue; }

    const etapa        = clean(cols[4]);
    const estado       = clean(cols[5]); // Em Andamento | Vendida | Perdida
    const valorUnico   = parseFloat(clean(cols[7]).replace(",", ".")) || 0;
    const valorRec     = parseFloat(clean(cols[8]).replace(",", ".")) || 0;
    const dataCriacao  = parseDate(clean(cols[10]));
    const responsavel  = clean(cols[23]);
    const lossReason   = clean(cols[26]) || null;
    const contactName  = clean(cols[29]);
    const email        = clean(cols[31]) || null;
    const phone        = clean(cols[32]) || null;

    // Determine stage using mapping
    const stage = resolveStage(etapa, estado, stageByName);
    if (!stage) {
      unknownStages.add(`"${etapa}" (${estado})`);
      skipped++;
      continue;
    }

    // Find owner; fall back to admin
    const owner = findUser(responsavel, userByName, adminUser) || adminUser;
    if (responsavel && !findUser(responsavel, userByName, null)) {
      unknownOwners.add(responsavel);
    }

    // Find or create contact
    const nameToUse = contactName || title;
    let contact = contactByName[norm(nameToUse)];
    if (!contact) {
      contact = await prisma.contact.create({
        data: { name: nameToUse, email, phone },
      });
      contactByName[norm(nameToUse)] = contact;
    }

    // Per-stage order counter
    stageOrderCounters[stage.id] = (stageOrderCounters[stage.id] ?? 0);
    const order = stageOrderCounters[stage.id]++;

    const value = valorUnico + valorRec;

    try {
      await prisma.deal.create({
        data: {
          title,
          value,
          contactId: contact.id,
          stageId:   stage.id,
          ownerId:   owner.id,
          createdById: owner.id,
          order,
          lossReason,
          company: "GRAFINORTE",
          createdAt: dataCriacao || new Date(),
        },
      });
      created++;
    } catch (e) {
      console.log(`❌ Erro ao criar "${title}": ${e.message}`);
      skipped++;
    }
  }

  if (unknownStages.size > 0)
    console.log(`⚠  Estágios não mapeados (ignorados): ${[...unknownStages].join(", ")}`);
  if (unknownOwners.size > 0)
    console.log(`⚠  Responsáveis não encontrados (usou admin): ${[...unknownOwners].join(", ")}`);
  console.log(`\n✅ ${created} negócios importados`);
  if (skipped) console.log(`⚠  ${skipped} ignorados`);
}

main()
  .catch((e) => { console.error("Erro:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

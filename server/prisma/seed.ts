import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/utils/password";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./data/grafinorte.db",
});
const prisma = new PrismaClient({ adapter });

const DEFAULT_COLUMNS = ["A Fazer", "Em Andamento", "Concluído"];

const DEFAULT_CRM_STAGES = [
  { name: "Novo Lead", isClosed: false, isWon: false },
  { name: "Qualificado", isClosed: false, isWon: false },
  { name: "Proposta Enviada", isClosed: false, isWon: false },
  { name: "Negociação", isClosed: false, isWon: false },
  { name: "Ganho", isClosed: true, isWon: true },
  { name: "Perdido", isClosed: true, isWon: false },
];

const DEFAULT_PRODUCTS = [
  {
    name: "Santinho",
    specifications: "Formato: 70 × 100 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 90 ou 75g",
  },
  {
    name: "Santão",
    specifications: "Formato: 100 × 140 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 90g",
  },
  {
    name: "Folder Informativo",
    specifications: "Formato: A4\nAcabamento: Dobra centro\nPapel: Couchê 90g\nPáginas: 4",
  },
  {
    name: "Cartão de Visita",
    specifications: "Formato: 48 × 88 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 200 ou 300g",
  },
  {
    name: "Colinha",
    specifications: "Formato: 48 × 88 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 90g",
  },
  {
    name: "Plano de Governo",
    specifications:
      "Formato: A4\nAcabamento: Refilado e grampeado\nPapel: Couchê 90g\nPáginas: 8, 12, 16, 20, 24",
  },
  {
    name: "Praguinha/Bóton",
    specifications:
      "Formato: 70 × 70 mm\nImpressão: Colorida frente\nPapel: Adesivo brilho\nAcabamento: Refile e meio corte",
  },
  {
    name: "Pragão/Bóton",
    specifications:
      "Formato: 100 × 100 mm\nImpressão: Colorida frente\nPapel: Adesivo brilho\nAcabamento: Refile e meio corte",
  },
  {
    name: "Crachá",
    specifications:
      "Formato: 100 × 140 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 300g\nAcabamento: Cordão nylon",
  },
  {
    name: "Adesivo Perfurado",
    specifications:
      "Formato: 100 × 70 mm ou 80 × 90 mm\nImpressão: Colorida frente\nPapel: Perfurado\nAcabamento: Refile e meio corte",
  },
  {
    name: "Adesivo Para-choque",
    specifications:
      "Formato: 100 × 300 mm e 80 × 260 mm\nImpressão: Colorida frente\nPapel: Adesivo vinil\nAcabamento: Refile e meio corte",
  },
  {
    name: "Jornal",
    specifications:
      "Formatos: Tabloide, Tabloide americano e Berliner\nImpressão: Colorida frente e verso\nPapel: Jornal 48g ou Offset 63g\nAcabamento: Refile",
  },
  {
    name: "Mala Direta",
    specifications: "Formato: A4\nImpressão: Colorida frente e verso\nPapel: Couchê 90g\nAcabamento: Duas dobras",
  },
  {
    name: "Postal Triplo",
    specifications: "Formato: 88 × 148 mm\nImpressão: Colorida frente e verso\nPapel: Couchê 250g",
  },
  {
    name: "Windbanner G",
    specifications: "Formato fechado: 650 × 2450 mm\nAcabamento: Dupla face costurado\nMaterial: Poliéster",
  },
  {
    name: "Windbanner GG",
    specifications: "Formato fechado: 650 × 3350 mm\nAcabamento: Dupla face costurado\nMaterial: Poliéster",
  },
  {
    name: "Bolachão 15 Redondo",
    specifications:
      "Formato: 15 × 15 cm\nImpressão: Colorida frente\nPapel: Perfurado ou vinil\nAcabamento: Refile e meio corte",
  },
  {
    name: "Bolachão 30 Redondo",
    specifications:
      "Formato: 30 × 30 cm\nImpressão: Colorida frente\nPapel: Perfurado ou vinil\nAcabamento: Refile e meio corte",
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@grafinorte.com.br";
  const adminName = process.env.ADMIN_NAME || "Administrador";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
      },
    });
    console.log(`Usuário admin criado: ${adminEmail} / senha: ${adminPassword}`);
    console.log("Troque essa senha no primeiro acesso, na página de Usuários.");
  } else {
    console.log(`Usuário admin já existe (${adminEmail}), nada a fazer.`);
  }

  const existingBoard = await prisma.board.findFirst();
  if (!existingBoard) {
    await prisma.board.create({
      data: {
        name: "Quadro Geral",
        columns: {
          create: DEFAULT_COLUMNS.map((name, order) => ({ name, order })),
        },
      },
    });
    console.log("Quadro padrão criado com colunas:", DEFAULT_COLUMNS.join(", "));
  } else {
    console.log("Quadro já existe, nada a fazer.");
  }

  const existingProductCount = await prisma.product.count();
  if (existingProductCount === 0) {
    await prisma.product.createMany({
      data: DEFAULT_PRODUCTS.map((product, order) => ({ ...product, order })),
    });
    console.log(`Catálogo padrão criado com ${DEFAULT_PRODUCTS.length} produtos.`);
  } else {
    console.log("Catálogo de produtos já existe, nada a fazer.");
  }

  const existingStageCount = await prisma.crmStage.count();
  if (existingStageCount === 0) {
    await prisma.crmStage.createMany({
      data: DEFAULT_CRM_STAGES.map((stage, order) => ({ ...stage, order })),
    });
    console.log("Funil de vendas padrão criado com estágios:", DEFAULT_CRM_STAGES.map((s) => s.name).join(", "));
  } else {
    console.log("Funil de vendas já existe, nada a fazer.");
  }

  // WhatsApp phone numbers
  const mainPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1233353023195021";
  await prisma.waPhoneNumber.upsert({
    where: { phoneNumberId: mainPhoneNumberId },
    update: {},
    create: { phoneNumberId: mainPhoneNumberId, displayName: "Grafinorte Principal", active: true },
  });
  await prisma.waPhoneNumber.upsert({
    where: { phoneNumberId: "1311728092015168" },
    update: {},
    create: { phoneNumberId: "1311728092015168", displayName: "Número Teste", active: true },
  });
  console.log("Números WhatsApp configurados.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

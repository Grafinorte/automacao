-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "value" REAL NOT NULL DEFAULT 0,
    "expectedCloseDate" DATETIME,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    "contactId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "quoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "crm_deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm_stages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_deals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_deals_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "crm_deal_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    CONSTRAINT "crm_deal_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_deal_activities_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_order_key" ON "crm_stages"("order");

-- CreateIndex
CREATE UNIQUE INDEX "crm_deals_quoteId_key" ON "crm_deals"("quoteId");

-- CreateIndex
CREATE INDEX "crm_deals_stageId_order_idx" ON "crm_deals"("stageId", "order");

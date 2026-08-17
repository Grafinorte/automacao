-- AlterTable: add follow-up and loss reason to crm_deals
ALTER TABLE "crm_deals" ADD COLUMN "nextFollowUp" DATETIME;
ALTER TABLE "crm_deals" ADD COLUMN "lossReason" TEXT;

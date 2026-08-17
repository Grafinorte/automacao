-- CreateTable
CREATE TABLE "hr_employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "birthDate" DATETIME,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "admissionDate" DATETIME NOT NULL,
    "terminationDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "salary" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "hr_employees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_salary_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "hr_salary_changes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hr_salary_changes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_vacations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "hr_vacations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    CONSTRAINT "hr_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hr_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_cpf_key" ON "hr_employees"("cpf");

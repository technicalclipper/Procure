-- Per-organisation, per-module approval configuration.

-- CreateEnum
CREATE TYPE "ApprovalModule" AS ENUM ('PURCHASE_REQUEST', 'BILL');
CREATE TYPE "ApprovalMode" AS ENUM ('ANY_ONE', 'ALL', 'QUORUM');

-- CreateTable
CREATE TABLE "ApprovalFlow" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "module" "ApprovalModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalFlow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalLevel" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT,
    "minAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "mode" "ApprovalMode" NOT NULL DEFAULT 'ANY_ONE',
    "quorumCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ApprovalLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalLevelApprover" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ApprovalLevelApprover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalFlow_orgId_module_key" ON "ApprovalFlow"("orgId", "module");
CREATE UNIQUE INDEX "ApprovalLevel_flowId_position_key" ON "ApprovalLevel"("flowId", "position");
CREATE UNIQUE INDEX "ApprovalLevelApprover_levelId_userId_key" ON "ApprovalLevelApprover"("levelId", "userId");

-- AddForeignKey
ALTER TABLE "ApprovalFlow" ADD CONSTRAINT "ApprovalFlow_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalLevel" ADD CONSTRAINT "ApprovalLevel_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "ApprovalFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalLevelApprover" ADD CONSTRAINT "ApprovalLevelApprover_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "ApprovalLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalLevelApprover" ADD CONSTRAINT "ApprovalLevelApprover_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Snapshot fields on the request
ALTER TABLE "PurchaseRequest"
  ADD COLUMN "flowSnapshot" JSONB,
  ADD COLUMN "currentLevel" INTEGER NOT NULL DEFAULT 1;

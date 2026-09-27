-- CreateEnum
CREATE TYPE "VendorPortalStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACTIVE');

-- AlterTable
ALTER TABLE "Vendor"
  ADD COLUMN "portalStatus" "VendorPortalStatus" NOT NULL DEFAULT 'NOT_INVITED',
  ADD COLUMN "portalToken" TEXT,
  ADD COLUMN "portalInvitedAt" TIMESTAMP(3),
  ADD COLUMN "portalActivatedAt" TIMESTAMP(3),
  ADD COLUMN "portalUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_portalToken_key" ON "Vendor"("portalToken");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_portalUserId_fkey"
  FOREIGN KEY ("portalUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

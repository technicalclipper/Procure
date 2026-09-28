-- Documents become org-scoped so numbers are per-organisation and the
-- buy-side lists don't have to join through department.

-- PurchaseRequest ----------------------------------------------------------
ALTER TABLE "PurchaseRequest" ADD COLUMN "orgId" TEXT;

UPDATE "PurchaseRequest" pr
SET "orgId" = d."orgId"
FROM "Department" d
WHERE d."id" = pr."departmentId";

DELETE FROM "PurchaseRequest" WHERE "orgId" IS NULL;
ALTER TABLE "PurchaseRequest" ALTER COLUMN "orgId" SET NOT NULL;

DROP INDEX IF EXISTS "PurchaseRequest_prNumber_key";
CREATE UNIQUE INDEX "PurchaseRequest_orgId_prNumber_key"
  ON "PurchaseRequest"("orgId", "prNumber");
CREATE INDEX "PurchaseRequest_orgId_status_idx"
  ON "PurchaseRequest"("orgId", "status");

ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PurchaseOrder ------------------------------------------------------------
ALTER TABLE "PurchaseOrder" ADD COLUMN "orgId" TEXT;

UPDATE "PurchaseOrder" po
SET "orgId" = d."orgId"
FROM "Department" d
WHERE d."id" = po."departmentId";

DELETE FROM "PurchaseOrder" WHERE "orgId" IS NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "orgId" SET NOT NULL;

DROP INDEX IF EXISTS "PurchaseOrder_poNumber_key";
CREATE UNIQUE INDEX "PurchaseOrder_orgId_poNumber_key"
  ON "PurchaseOrder"("orgId", "poNumber");
CREATE INDEX "PurchaseOrder_orgId_status_idx"
  ON "PurchaseOrder"("orgId", "status");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

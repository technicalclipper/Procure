-- Fulfilment documents become org-scoped, the same way PR and PO are.
--
-- GRN-0001 and BILL-0001 are numbers a finance team says out loud. Held
-- globally unique they would run PROCURE-wide, so the second org to
-- receive anything would start at GRN-0002. The numbers restart per org
-- because they are scoped by a composite index.
--
-- VendorInvoice instead keys on the vendor: two different suppliers may
-- both legitimately send INV-001, but the same supplier sending INV-001
-- twice is a duplicate-invoice attempt, which is exactly what the index
-- is there to stop.

-- ── GoodsReceipt ─────────────────────────────────────────────────────
ALTER TABLE "GoodsReceipt" ADD COLUMN "orgId" TEXT;

UPDATE "GoodsReceipt" g
SET "orgId" = o."orgId"
FROM "PurchaseOrder" o
WHERE o."id" = g."orderId";

ALTER TABLE "GoodsReceipt" ALTER COLUMN "orgId" SET NOT NULL;

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "GoodsReceipt_grnNumber_key";
CREATE UNIQUE INDEX "GoodsReceipt_orgId_grnNumber_key"
  ON "GoodsReceipt"("orgId", "grnNumber");
CREATE INDEX "GoodsReceipt_orgId_idx" ON "GoodsReceipt"("orgId");

-- ── VendorInvoice ────────────────────────────────────────────────────
ALTER TABLE "VendorInvoice" ADD COLUMN "orgId" TEXT;
ALTER TABLE "VendorInvoice" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "VendorInvoice" ADD COLUMN "note" TEXT;

UPDATE "VendorInvoice" i
SET "orgId" = o."orgId", "vendorId" = o."vendorId"
FROM "PurchaseOrder" o
WHERE o."id" = i."orderId";

ALTER TABLE "VendorInvoice" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "VendorInvoice" ALTER COLUMN "vendorId" SET NOT NULL;

ALTER TABLE "VendorInvoice"
  ADD CONSTRAINT "VendorInvoice_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorInvoice"
  ADD CONSTRAINT "VendorInvoice_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "VendorInvoice_vendorId_vendorInvoiceNumber_key"
  ON "VendorInvoice"("vendorId", "vendorInvoiceNumber");
CREATE INDEX "VendorInvoice_orgId_idx" ON "VendorInvoice"("orgId");

-- ── Bill ─────────────────────────────────────────────────────────────
ALTER TABLE "Bill" ADD COLUMN "orgId" TEXT;

UPDATE "Bill" b
SET "orgId" = o."orgId"
FROM "PurchaseOrder" o
WHERE o."id" = b."orderId";

ALTER TABLE "Bill" ALTER COLUMN "orgId" SET NOT NULL;

ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Bill_billNumber_key";
CREATE UNIQUE INDEX "Bill_orgId_billNumber_key" ON "Bill"("orgId", "billNumber");
CREATE INDEX "Bill_orgId_status_idx" ON "Bill"("orgId", "status");

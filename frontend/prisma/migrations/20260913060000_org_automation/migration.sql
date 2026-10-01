-- Settlement automation, per organisation.
--
-- Off by default. Turning it on is a statement about where an
-- organisation believes its authority lives: if the three-way match
-- passing and the contract holding enough approver signatures really
-- are the authorisation, then a person pressing a button afterwards is
-- a fourth approval nobody designed.
--
-- It grants no new power. The contract still verifies every signature,
-- the allowlist and the budget, and still reverts. What it removes is
-- the last human step that wasn't deciding anything.
ALTER TABLE "Organization" ADD COLUMN "autoSettle" BOOLEAN NOT NULL DEFAULT false;

-- Records what the automation did, successes and failures alike. An
-- automation you cannot audit is one nobody will trust with money.
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "detail" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AutomationRun_orgId_createdAt_idx" ON "AutomationRun"("orgId", "createdAt");
CREATE INDEX "AutomationRun_kind_subjectId_idx" ON "AutomationRun"("kind", "subjectId");

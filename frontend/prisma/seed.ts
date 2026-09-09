import { PrismaClient, AccountType, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Whole dollars -> USDC base units (6 dp). */
const usd = (n: number) => BigInt(n) * 1_000_000n;

const CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: AccountType;
}[] = [
  { code: "1000", name: "Cash — USDC Treasury", type: AccountType.ASSET },
  { code: "1010", name: "Cash — USDC Engineering", type: AccountType.ASSET },
  { code: "1020", name: "Cash — USDC Marketing", type: AccountType.ASSET },
  { code: "1030", name: "Cash — USDC Operations", type: AccountType.ASSET },
  { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
  // The accounting embodiment of the three-way match: it holds the timing
  // difference between "goods arrived" and "invoice arrived". A non-zero
  // balance here IS the match exception report.
  { code: "2100", name: "GR/IR Clearing", type: AccountType.LIABILITY },
  { code: "5000", name: "Infrastructure Expense", type: AccountType.EXPENSE },
  { code: "5100", name: "Software Expense", type: AccountType.EXPENSE },
  { code: "5200", name: "Professional Services", type: AccountType.EXPENSE },
  { code: "6000", name: "Marketing Expense", type: AccountType.EXPENSE },
];

const DEPARTMENTS = [
  { code: "ENG", name: "Engineering", budget: usd(50_000), cash: "1010" },
  { code: "MKT", name: "Marketing", budget: usd(20_000), cash: "1020" },
  { code: "OPS", name: "Operations", budget: usd(15_000), cash: "1030" },
];

const ITEMS = [
  { code: "CLOUD", name: "Cloud compute", unit: "month", rate: usd(4_000), account: "5000", category: "Infrastructure" },
  { code: "SEAT", name: "Software licence", unit: "seat", rate: usd(30), account: "5100", category: "Software" },
  { code: "CONSULT", name: "Consulting", unit: "day", rate: usd(900), account: "5200", category: "Professional Services" },
  { code: "ADS", name: "Ad placement", unit: "campaign", rate: usd(2_500), account: "6000", category: "Marketing" },
];

const email = (key: string, fallback: string) =>
  (process.env[key] || fallback).trim();

async function main() {
  console.log("seeding…");

  const org = await db.organization.upsert({
    where: { id: "org_procure_demo" },
    update: {},
    create: { id: "org_procure_demo", name: "Northwind Labs" },
  });
  console.log(`org: ${org.name}`);

  for (const a of CHART_OF_ACCOUNTS) {
    await db.account.upsert({
      where: { orgId_code: { orgId: org.id, code: a.code } },
      update: { name: a.name, type: a.type },
      create: { ...a, orgId: org.id },
    });
  }
  console.log(`chart of accounts: ${CHART_OF_ACCOUNTS.length} accounts`);

  for (const d of DEPARTMENTS) {
    await db.department.upsert({
      where: { orgId_code: { orgId: org.id, code: d.code } },
      update: { name: d.name, budgetMinor: d.budget, cashAccountCode: d.cash },
      create: {
        orgId: org.id,
        code: d.code,
        name: d.name,
        budgetMinor: d.budget,
        cashAccountCode: d.cash,
      },
    });
  }
  console.log(`departments: ${DEPARTMENTS.map((d) => d.code).join(", ")}`);

  for (const i of ITEMS) {
    const account = await db.account.findUnique({
      where: { orgId_code: { orgId: org.id, code: i.account } },
    });
    await db.item.upsert({
      where: { orgId_code: { orgId: org.id, code: i.code } },
      update: {},
      create: {
        orgId: org.id,
        code: i.code,
        name: i.name,
        unit: i.unit,
        defaultRateMinor: i.rate,
        expenseAccountCode: i.account,
        expenseAccountId: account?.id,
        category: i.category,
      },
    });
  }
  console.log(`items: ${ITEMS.length}`);

  // Demo personas. Plus-addressing keeps them distinct in the outbox while
  // all landing in one inbox — Resend restricts unverified accounts to the
  // signup address.
  const people = [
    { key: "DEMO_CONTROLLER_EMAIL", fallback: "controller@procure.test", name: "Ada Controller", roles: [[null, Role.CONTROLLER]] },
    { key: "DEMO_APPROVER_A_EMAIL", fallback: "approver.a@procure.test", name: "Priya Approver", roles: [["ENG", Role.APPROVER]] },
    { key: "DEMO_APPROVER_B_EMAIL", fallback: "approver.b@procure.test", name: "Sam Approver", roles: [["ENG", Role.APPROVER]] },
    { key: "DEMO_APPROVER_C_EMAIL", fallback: "approver.c@procure.test", name: "Lee Approver", roles: [["ENG", Role.APPROVER]] },
    { key: "DEMO_REQUESTER_EMAIL", fallback: "requester@procure.test", name: "Jo Requester", roles: [["ENG", Role.REQUESTER]] },
  ] as const;

  const depts = await db.department.findMany({ where: { orgId: org.id } });
  const byCode = new Map(depts.map((d) => [d.code, d]));

  for (const p of people) {
    const addr = email(p.key, p.fallback);
    const user = await db.user.upsert({
      where: { email: addr },
      update: { name: p.name },
      create: { email: addr, name: p.name, orgId: org.id },
    });

    for (const [code, role] of p.roles) {
      // A controller is org-wide: give them the role in every department.
      const targets = code ? [byCode.get(code)!] : depts;
      for (const dept of targets) {
        if (!dept) continue;
        await db.membership.upsert({
          where: {
            userId_departmentId_role: {
              userId: user.id,
              departmentId: dept.id,
              role,
            },
          },
          update: {},
          create: { userId: user.id, departmentId: dept.id, role },
        });
      }
    }
  }
  console.log(`users: ${people.length}`);

  console.log("\nseed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

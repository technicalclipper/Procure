import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  invitation: "Invitation",
  "vendor-portal-invite": "Vendor portal invite",
  "purchase-order": "Purchase order",
  "po-accepted": "Order accepted",
  "po-rejected": "Order rejected",
  "po-message": "Message",
  "goods-received-vendor": "Goods received (vendor)",
  "goods-received-buyer": "Goods received",
  "invoice-matched": "Invoice matches",
  "invoice-variance": "Invoice variance",
  "bill-matched": "Bill matched",
  "bill-match-failed": "Match failed",
};

/**
 * Every mail the system tried to send.
 *
 * Written whether or not delivery succeeded, which is the point: on a
 * sandboxed mail provider most of these never leave the building, and
 * "did the vendor actually get told?" has to be answerable from the
 * record rather than from somebody's inbox.
 */
export default async function OutboxPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireOrgManage(slug);

  const notifications = await db.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const failed = notifications.filter((n) => !n.sentAt).length;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Outbox</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Every email the system raised, recorded whether or not it left
            the building.
          </p>
        </div>
        {failed > 0 && (
          <div className="shrink-0 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
            {failed} not delivered
          </div>
        )}
      </header>

      {failed > 0 && (
        <div className="mb-5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-600">
          Undelivered usually means the mail provider is restricted to the
          account owner&apos;s own address until a sending domain is
          verified. The content was still rendered and recorded — invitation
          and portal links are shown in the app for exactly this reason.
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            Nothing sent yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            Inviting someone, issuing an order or confirming receipt all
            raise mail, and each one lands here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Template</Th>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>When</Th>
                <Th>Delivery</Th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr
                  key={n.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 text-slate-900">
                    {LABEL[n.template] ?? n.template}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">
                    {n.recipient}
                  </td>
                  <td className="max-w-sm truncate px-4 py-2.5 text-[12px] text-slate-600">
                    {n.subject}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">
                    {n.createdAt.toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        n.sentAt
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-600 ring-slate-500/20"
                      }`}
                    >
                      {n.sentAt ? "sent" : "recorded"}
                    </span>
                    {n.error && (
                      <div
                        className="mt-0.5 max-w-xs truncate text-[11px] text-amber-700"
                        title={n.error}
                      >
                        {n.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

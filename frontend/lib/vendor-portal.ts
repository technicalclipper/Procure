import { redirect } from "next/navigation";
import { VendorPortalStatus } from "@prisma/client";
import { db } from "./db";
import { getSessionUser, type SessionUser } from "./session";

/**
 * Vendor portal access.
 *
 * A vendor is not a member of the buying organisation — they hold a
 * claimed portal on one or more Vendor records. Every query here is
 * scoped by portalUserId, so a supplier can only ever reach their own
 * orders even if they guess an id.
 */

export type VendorContext = {
  user: SessionUser;
  vendorIds: string[];
};

export async function requireVendorPortal(): Promise<VendorContext> {
  const user = await getSessionUser();
  if (!user) redirect("/vendor");

  const vendors = await db.vendor.findMany({
    where: { portalUserId: user.id, portalStatus: VendorPortalStatus.ACTIVE },
    select: { id: true },
  });
  if (vendors.length === 0) redirect("/vendor");

  return { user, vendorIds: vendors.map((v) => v.id) };
}

/**
 * An order, only if it belongs to a vendor this user holds.
 * Returns null rather than throwing so the caller can 404 — an order
 * someone else owns should be indistinguishable from one that
 * doesn't exist.
 */
export async function getVendorOrder(orderId: string, vendorIds: string[]) {
  const order = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    include: {
      org: { select: { name: true } },
      vendor: true,
      request: { include: { lines: { include: { item: true } } } },
      receipt: true,
      invoice: true,
      bill: { include: { payment: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || !vendorIds.includes(order.vendorId)) return null;
  return order;
}

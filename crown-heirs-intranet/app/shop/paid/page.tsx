import Link from "next/link";
import { eq } from "drizzle-orm";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { shopOrders } from "@/lib/db/schema";
import { getOrder, formatPrice } from "@/lib/shop";
import { isSquareOrderPaid } from "@/lib/squareCheckout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order — Crown Heirs Team Hub" };

export default async function ShopPaidPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  let paid = false;
  let found = false;
  let total: string | null = null;

  if (orderId) {
    const order = await getOrder(orderId);
    if (order) {
      found = true;
      total = order.totalAmount;
      paid = order.paymentStatus === "paid";
      // Confirm with Square on return, then record it.
      if (!paid && order.squareOrderId) {
        if (await isSquareOrderPaid(order.squareOrderId)) {
          await db.update(shopOrders).set({ paymentStatus: "paid" }).where(eq(shopOrders.id, order.id));
          paid = true;
        }
      }
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team Shop</div>
          <h1 className="title">{paid ? "Payment received" : "Order placed"}</h1>
        </div>
        <div className="card" style={{ cursor: "default" }}>
          {!found ? (
            <p>We couldn’t find that order. Check the Team Shop for your order status.</p>
          ) : paid ? (
            <p>
              Thank you! Your payment{total ? ` of ${formatPrice(total)}` : ""} was received and your order is confirmed.
              The team has been notified and will get your items to you.
            </p>
          ) : (
            <p>
              Your order is recorded. If you just paid, it can take a moment to confirm — refresh this page shortly,
              or check with a manager. If you didn’t finish paying, you can still pay in person.
            </p>
          )}
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn" href="/shop">Back to the shop</Link>
            <Link className="btn btn-ghost" href="/">Home</Link>
          </div>
        </div>
      </main>
    </>
  );
}

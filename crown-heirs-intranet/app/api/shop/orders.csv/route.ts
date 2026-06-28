import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { listOrders, formatPrice, priceNumber } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per order line — easy to compile in a spreadsheet.
export async function GET() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) return new Response("Forbidden", { status: 403 });

  let orders;
  try {
    orders = await listOrders(2000);
  } catch {
    return new Response("Shop not set up", { status: 200 });
  }

  const header = ["Date", "Order ID", "Employee", "Email", "Product", "Size", "Quantity", "Unit Price", "Line Total", "Payment", "Status", "Note"];
  const lines = [header.map(csvCell).join(",")];

  for (const { order, items } of orders) {
    const date = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : "";
    const pay = order.paymentMethod === "square" ? "Square" : "Payroll / in person";
    for (const it of items) {
      const unit = priceNumber(it.unitPrice);
      const lineTotal = unit != null ? unit * it.quantity : null;
      lines.push(
        [
          date,
          order.id,
          order.employeeName,
          order.employeeEmail,
          it.productName,
          it.variantLabel,
          it.quantity,
          unit != null ? formatPrice(unit) : "",
          lineTotal != null ? formatPrice(lineTotal) : "",
          pay,
          order.paymentStatus,
          order.note,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="team-shop-orders-${today}.csv"`,
    },
  });
}

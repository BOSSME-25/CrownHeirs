import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import {
  formatPrice,
  listProducts,
  productImageSrc,
  shopCategoryLabel,
  SHOP_CATEGORIES,
  type ProductWithVariants,
} from "@/lib/shop";
import { squareCheckoutAvailable } from "@/lib/squareCheckout";
import { placeOrder } from "@/app/shop/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team Shop — Crown Heirs Team Hub" };

export default async function ShopPage() {
  const session = await auth();
  const canManage = (await getAccess(session?.user?.email)).canApprove;

  let setupNeeded = false;
  let products: ProductWithVariants[] = [];
  try {
    products = await listProducts(true);
  } catch {
    setupNeeded = true;
  }
  const squareOn = await squareCheckoutAvailable();

  // Group by category in our preferred order.
  const order = SHOP_CATEGORIES.map((c) => c.id);
  const byCat = new Map<string, ProductWithVariants[]>();
  for (const p of products) {
    const key = p.product.category;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(p);
  }
  const cats = [...byCat.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team Shop</div>
          <h1 className="title">Scrubs &amp; Merch</h1>
          <p className="lede">
            Pick your sizes and quantities, then place your order. It goes straight to the
            owners and directors to fulfill.
          </p>
        </div>

        {canManage && (
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" href="/shop/manage">Manage products</Link>
            <Link className="btn btn-ghost" href="/shop/orders">Orders &amp; CSV</Link>
          </div>
        )}

        {setupNeeded ? (
          <div className="notice">
            The Team Shop isn’t set up yet. Run <strong>Admin → “Set up / update database”</strong>, then come back.
          </div>
        ) : products.length === 0 ? (
          <div className="notice">
            The shop is empty right now.
            {canManage && <> Add scrubs and merch from <Link href="/shop/manage">Manage products</Link>.</>}
          </div>
        ) : (
          <form action={placeOrder}>
            {cats.map((cat) => (
              <section key={cat} style={{ marginBottom: 28 }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 12px" }}>
                  {shopCategoryLabel(cat)}
                </h2>
                <div className="grid">
                  {byCat.get(cat)!.map(({ product, variants }) => {
                    const madeToOrder = product.stockMode === "made_to_order";
                    const img = productImageSrc(product);
                    return (
                    <div className="card" key={product.id} style={{ cursor: "default" }}>
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={product.name}
                          style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: "var(--r-s,8px)", marginBottom: 10 }}
                        />
                      )}
                      <h3 style={{ margin: "0 0 2px" }}>{product.name}</h3>
                      {product.price && (
                        <div style={{ fontWeight: 600, color: "var(--terra,#a0624a)" }}>{formatPrice(product.price)}</div>
                      )}
                      {madeToOrder && (
                        <div className="muted" style={{ fontSize: "0.76rem" }}>Made to order</div>
                      )}
                      {product.description && (
                        <p className="muted" style={{ fontSize: "0.85rem", margin: "6px 0 10px", whiteSpace: "pre-wrap" }}>
                          {product.description}
                        </p>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {variants.length === 0 ? (
                          <p className="muted" style={{ fontSize: "0.82rem" }}>No sizes set yet.</p>
                        ) : (
                          variants.map((v) => {
                            const out = !madeToOrder && v.stock <= 0;
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: "1px solid var(--border,#eee)" }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  {v.label}{" "}
                                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                                    {madeToOrder ? "" : out ? "· out of stock" : `· ${v.stock} available`}
                                  </span>
                                </span>
                                <input
                                  type="number"
                                  name={`qty_${v.id}`}
                                  min={0}
                                  max={madeToOrder ? undefined : v.stock}
                                  defaultValue={0}
                                  disabled={out}
                                  aria-label={`${product.name} ${v.label} quantity`}
                                  style={{ width: 64 }}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="card" style={{ cursor: "default", marginTop: 8 }}>
              <div className="field">
                <label htmlFor="note">Note for the order (optional)</label>
                <textarea id="note" name="note" rows={2} placeholder="Anything the team should know — color preference, urgency, etc." />
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: "4px 0 12px" }}>
                <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 6 }}>How would you like to pay?</legend>
                {squareOn && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                    <input type="radio" name="paymentMethod" value="square" defaultChecked />
                    <span>Pay now with card (Square) — you’ll be taken to a secure Square page for items that have a price.</span>
                  </label>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                  <input type="radio" name="paymentMethod" value="payroll" defaultChecked={!squareOn} />
                  <span>Payroll deduction / pay in person — the team will collect from you.</span>
                </label>
              </fieldset>
              <button className="btn" type="submit">Place order</button>
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8, marginBottom: 0 }}>
                Set a quantity on the sizes you want, choose how to pay, then place your order. You’ll get a confirmation and the team will be emailed.
              </p>
            </div>
          </form>
        )}
      </main>
    </>
  );
}

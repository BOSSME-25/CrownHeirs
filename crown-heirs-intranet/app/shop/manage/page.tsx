import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { formatPrice, listProducts, productImageSrc, shopCategoryLabel, SHOP_CATEGORIES, STOCK_MODES, type ProductWithVariants } from "@/lib/shop";
import { addProduct, addVariant, removeVariant, setProductActive, setVariantStock, updateProduct } from "@/app/shop/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Team Shop — Crown Heirs Team Hub" };

export default async function ManageShopPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="page-head">
            <div className="eyebrow">Team Shop</div>
            <h1 className="title">Manage products</h1>
          </div>
          <div className="notice">This page is for managers and owners. Visit the <Link href="/shop">Team Shop</Link> to place an order.</div>
        </main>
      </>
    );
  }

  let setupNeeded = false;
  let products: ProductWithVariants[] = [];
  try {
    products = await listProducts(false);
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team Shop</div>
          <h1 className="title">Manage products</h1>
          <p className="lede">Add or take down products and keep the size stock counts current.</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/shop">View shop</Link>
          <Link className="btn btn-ghost" href="/shop/orders">Orders &amp; CSV</Link>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → “Set up / update database”</strong> first to create the shop tables.</div>
        ) : (
          <>
            {/* Add a product */}
            <form action={addProduct} className="card" style={{ cursor: "default", padding: "16px 18px", marginBottom: 24 }}>
              <h2 style={{ marginTop: 0 }}>Add a product</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="name">Name *</label>
                  <input id="name" name="name" required placeholder="e.g. Crown Heirs Scrub Top" />
                </div>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" name="category" defaultValue="scrubs">
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="stockMode">Type</label>
                  <select id="stockMode" name="stockMode" defaultValue="tracked">
                    {STOCK_MODES.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="price">Price (optional)</label>
                  <input id="price" name="price" inputMode="decimal" placeholder="0.00" />
                </div>
              </div>
              <p className="muted" style={{ fontSize: "0.78rem", margin: "2px 0 0" }}>
                <strong>In-stock</strong> = limited by stock counts. <strong>Made to order</strong> = always orderable, no stock kept (e.g. scrubs).
              </p>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="description">Description (optional)</label>
                <textarea id="description" name="description" rows={2} />
              </div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label htmlFor="sizes">Sizes (comma separated)</label>
                  <input id="sizes" name="sizes" placeholder="XS, S, M, L, XL, 2XL — leave blank for one size" />
                </div>
                <div className="field">
                  <label htmlFor="initialStock">Starting stock per size</label>
                  <input id="initialStock" name="initialStock" inputMode="numeric" defaultValue={0} />
                </div>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="image">Product photo (upload from your phone)</label>
                <input id="image" name="image" type="file" accept="image/*" />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="imageUrl">…or paste an image link</label>
                <input id="imageUrl" name="imageUrl" placeholder="https://…" />
              </div>
              <button className="btn" type="submit" style={{ marginTop: 12 }}>Add product</button>
            </form>

            {products.length === 0 ? (
              <p className="muted">No products yet — add your first one above.</p>
            ) : (
              products.map(({ product, variants }) => (
                <details key={product.id} className="card" style={{ cursor: "default", padding: "14px 16px", marginBottom: 10 }} open={!product.active ? false : undefined}>
                  <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>
                      {product.name}
                      <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
                        {" "}· {shopCategoryLabel(product.category)}{product.price ? ` · ${formatPrice(product.price)}` : ""}
                      </span>
                    </span>
                    {!product.active && <span className="muted" style={{ fontSize: "0.78rem" }}>· taken down</span>}
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {product.stockMode === "made_to_order" ? "made to order" : `${variants.reduce((s, v) => s + v.stock, 0)} in stock`}
                    </span>
                  </summary>

                  {/* Sizes & stock */}
                  <div style={{ marginTop: 12 }}>
                    {variants.map((v) => (
                      <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0", borderTop: "1px solid var(--border,#eee)" }}>
                        <span style={{ flex: 1, minWidth: 90, fontWeight: 600 }}>{v.label}</span>
                        {product.stockMode === "made_to_order" ? (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>made to order</span>
                        ) : (
                          <form action={setVariantStock} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="hidden" name="variantId" value={v.id} />
                            <input type="number" name="stock" min={0} defaultValue={v.stock} aria-label={`${v.label} stock`} style={{ width: 80 }} />
                            <button className="btn btn-ghost" type="submit">Set</button>
                          </form>
                        )}
                        <form action={removeVariant}>
                          <input type="hidden" name="variantId" value={v.id} />
                          <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Remove</button>
                        </form>
                      </div>
                    ))}
                    <form action={addVariant} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input name="label" placeholder="Add a size (e.g. 3XL)" required style={{ minWidth: 140 }} />
                      {product.stockMode !== "made_to_order" && (
                        <input type="number" name="stock" min={0} defaultValue={0} aria-label="New size stock" style={{ width: 80 }} />
                      )}
                      <button className="btn btn-ghost" type="submit">Add size</button>
                    </form>
                  </div>

                  {/* Edit / take down */}
                  <details style={{ marginTop: 12, borderTop: "1px solid var(--border,#eee)", paddingTop: 12 }}>
                    <summary className="btn-link" style={{ cursor: "pointer" }}>Edit details / take down…</summary>
                    <form action={updateProduct} style={{ marginTop: 10 }}>
                      <input type="hidden" name="productId" value={product.id} />
                      <div className="form-grid">
                        <div className="field">
                          <label>Name</label>
                          <input name="name" defaultValue={product.name} required />
                        </div>
                        <div className="field">
                          <label>Category</label>
                          <select name="category" defaultValue={product.category}>
                            {SHOP_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Type</label>
                          <select name="stockMode" defaultValue={product.stockMode}>
                            {STOCK_MODES.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Price</label>
                          <input name="price" defaultValue={product.price ?? ""} inputMode="decimal" />
                        </div>
                      </div>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>Description</label>
                        <textarea name="description" rows={2} defaultValue={product.description ?? ""} />
                      </div>
                      {productImageSrc(product) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={productImageSrc(product)!} alt={product.name} style={{ height: 70, borderRadius: 6, margin: "8px 0" }} />
                      )}
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>Replace photo (upload)</label>
                        <input name="image" type="file" accept="image/*" />
                      </div>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>…or image link</label>
                        <input name="imageUrl" defaultValue={product.imageUrl ?? ""} placeholder="https://…" />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button className="btn btn-ghost" type="submit">Save details</button>
                        <button className="btn-link" type="submit" formAction={setProductActive} name="active" value={product.active ? "0" : "1"} style={{ color: product.active ? "var(--terra,#a0624a)" : undefined }}>
                          {product.active ? "Take down" : "Put back in shop"}
                        </button>
                      </div>
                    </form>
                  </details>
                </details>
              ))
            )}
          </>
        )}
      </main>
    </>
  );
}

import type { FireMutationArg, FireMutationResult } from "../types.ts";

/**
 * MUST run in the page's MAIN world — accesses `window.__APOLLO_CLIENT__`.
 *
 * Extracts the `UpdateCartItemsMutation` DocumentNode from Instacart's webpack bundles
 * (shared by sameday.costco.com since it's a co-branded Instacart storefront) and fires
 * it through the page's own Apollo client, which handles persisted-query hashing.
 */
export async function pageFireMutation(arg: FireMutationArg): Promise<FireMutationResult> {
  const w = window as unknown as {
    __APOLLO_CLIENT__?: {
      mutate: (opts: {
        mutation: unknown;
        variables: unknown;
        fetchPolicy?: string;
      }) => Promise<{ data?: unknown; errors?: unknown[] }>;
    };
  };
  const client = w.__APOLLO_CLIENT__;
  if (!client) return { ok: false, error: "window.__APOLLO_CLIENT__ not exposed" };

  // 1. Locate the bundle containing UpdateCartItemsMutation.
  const bundles = [...document.querySelectorAll("script[src]")]
    .map((s) => (s as HTMLScriptElement).src)
    .filter((u) => u.includes("webpack_bundle"));

  let astText: string | null = null;
  const TARGET = "UpdateCartItemsMutation";
  for (const src of bundles) {
    const resp = await fetch(src, { credentials: "omit" });
    if (!resp.ok) continue;
    const text = await resp.text();
    const mutIdx = text.indexOf(TARGET);
    if (mutIdx === -1) continue;
    const docStart = text.lastIndexOf('{kind:"Document"', mutIdx);
    if (docStart === -1) continue;
    // Brace-match to extract the AST literal. Respects strings.
    let depth = 0,
      inStr = false,
      strCh: string | null = null,
      end = docStart;
    for (let i = docStart; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === strCh) inStr = false;
      } else if (c === '"' || c === "'") {
        inStr = true;
        strCh = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    astText = text.slice(docStart, end);
    break;
  }
  if (!astText) return { ok: false, error: "mutation AST not found in any webpack bundle" };

  let ast: unknown;
  try {
    ast = Function(`return (${astText})`)();
  } catch (e) {
    return { ok: false, error: `failed to parse AST: ${(e as Error).message}` };
  }

  // 2. Fire the mutation via the page's Apollo client.
  try {
    const variables: Record<string, unknown> = {
      cartType: arg.cartType,
      requestTimestamp: Date.now(),
      cartItemUpdates: arg.cartItemUpdates,
    };
    if (arg.cartId) variables.cartId = arg.cartId;
    const res = await client.mutate({
      mutation: ast,
      variables,
      fetchPolicy: "no-cache",
    });
    if (res.errors && res.errors.length) {
      return {
        ok: false,
        error: `graphql errors: ${JSON.stringify(res.errors).slice(0, 500)}`,
      };
    }
    const data = res.data as
      | {
          updateCartItems?: {
            cart?: {
              id: string;
              itemCount: number;
              cartItemCollection?: {
                cartItems?: Array<{
                  basketProduct: { productId: string; v4ItemId: string };
                  quantity: number;
                  quantityType: string;
                }>;
              };
            };
          };
        }
      | undefined;
    const cart = data?.updateCartItems?.cart;
    if (!cart) return { ok: false, error: "mutation returned no cart" };
    return {
      ok: true,
      cart: {
        id: cart.id,
        itemCount: cart.itemCount,
        items: (cart.cartItemCollection?.cartItems ?? []).map((ci) => ({
          productId: ci.basketProduct.productId,
          v4ItemId: ci.basketProduct.v4ItemId,
          quantity: ci.quantity,
          quantityType: ci.quantityType,
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: `apollo mutate threw: ${(e as Error).message}` };
  }
}

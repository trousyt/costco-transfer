import type { ReadCartIdArg, ReadCartIdResult } from "../types.ts";

/** Reads the logged-in (or guest) user's cart id for a given retailerId. */
export async function pageReadCartId(arg: ReadCartIdArg): Promise<ReadCartIdResult> {
  const ext = encodeURIComponent(
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: arg.hash } }),
  );
  const url = `/graphql?operationName=CartSwitcherSingleRetailerCartIds&variables=%7B%7D&extensions=${ext}`;
  const r = await fetch(url, {
    credentials: "include",
    headers: { "x-client-identifier": "web" },
  });
  const body = await r.json().catch(() => ({}));
  const carts: Array<{ id: string; retailerId?: string }> = body?.data?.userCarts?.carts ?? [];
  const match = carts.find((c) => c.retailerId === arg.retailerId);
  return { cart_id: match?.id ?? null };
}

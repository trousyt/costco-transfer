import type { ReadCartDataArg, ReadCartDataResult } from "../types.ts";

/** Reads the full cart (productIds, v4ItemIds, quantities). */
export async function pageReadCartData(arg: ReadCartDataArg): Promise<ReadCartDataResult> {
  const variables = encodeURIComponent(JSON.stringify({ id: arg.cartId }));
  const ext = encodeURIComponent(
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: arg.hash } }),
  );
  const url = `/graphql?operationName=CartData&variables=${variables}&extensions=${ext}`;
  const r = await fetch(url, {
    credentials: "include",
    headers: { "x-client-identifier": "web" },
  });
  const body = await r.json().catch(() => ({}));
  const raw: Array<{
    basketProduct: { productId: string; v4ItemId: string };
    quantity: number;
    quantityType: string;
  }> = body?.data?.userCart?.cartItemCollection?.cartItems ?? [];
  return {
    item_count: body?.data?.userCart?.itemCount ?? raw.length,
    items: raw.map((ci) => ({
      productId: ci.basketProduct.productId,
      v4ItemId: ci.basketProduct.v4ItemId,
      quantity: ci.quantity,
      quantityType: ci.quantityType,
    })),
  };
}

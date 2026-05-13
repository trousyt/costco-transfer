import type { ReadItemsArg, ReadItemsResult } from "../types.ts";

type RawItem = {
  id: string;
  productId: string;
  legacyId?: string;
  name: string;
  brandName?: string;
  size?: string;
  price?: {
    viewSection?: {
      itemCard?: { priceString?: string; plainFullPriceString?: string };
    };
  };
  availability?: { available?: boolean };
};

/** Batch-fetches item metadata (names, brands, sizes, prices, availability). */
export async function pageReadItems(arg: ReadItemsArg): Promise<ReadItemsResult> {
  const variables = encodeURIComponent(
    JSON.stringify({
      ids: arg.ids,
      shopId: arg.shopId,
      zoneId: arg.zoneId,
      postalCode: arg.postalCode,
    }),
  );
  const ext = encodeURIComponent(
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: arg.hash } }),
  );
  const url = `/graphql?operationName=Items&variables=${variables}&extensions=${ext}`;
  const r = await fetch(url, {
    credentials: "include",
    headers: { "x-client-identifier": "web" },
  });
  const body = await r.json().catch(() => ({}));
  const raw: RawItem[] = body?.data?.items ?? [];
  return {
    items: raw.map((it) => ({
      id: it.id,
      product_id: it.productId,
      legacy_id: it.legacyId ?? null,
      name: it.name,
      brand: it.brandName ?? null,
      size: it.size ?? null,
      price: it.price?.viewSection?.itemCard?.priceString ?? null,
      full_price: it.price?.viewSection?.itemCard?.plainFullPriceString ?? null,
      available: it.availability?.available ?? null,
    })),
  };
}

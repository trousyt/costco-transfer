// Shared types for CLI + extension.

export type PreflightArg = { hash: string };
export type PreflightResult = { user_id: string | null; guest: boolean | null; email: string | null };

export type ReadCartIdArg = { hash: string; retailerId: string };
export type ReadCartIdResult = { cart_id: string | null };

export type ReadCartDataArg = { hash: string; cartId: string };
export type CartDataItem = {
  productId: string;
  v4ItemId: string;
  quantity: number;
  quantityType: string;
};
export type ReadCartDataResult = { item_count: number; items: CartDataItem[] };

export type ReadItemsArg = {
  hash: string;
  ids: string[];
  shopId: string;
  zoneId: string;
  postalCode: string;
};
export type ItemMeta = {
  id: string;
  product_id: string;
  legacy_id: string | null;
  name: string;
  brand: string | null;
  size: string | null;
  price: string | null;
  full_price: string | null;
  available: boolean | null;
};
export type ReadItemsResult = { items: ItemMeta[] };

export type CartItemUpdate = {
  itemId: string;
  quantity: number;
  quantityType: string;
};
export type FireMutationArg = {
  cartId: string | null;
  cartType: string;
  cartItemUpdates: CartItemUpdate[];
};
export type FireMutationResult = {
  ok: boolean;
  error?: string;
  cart?: {
    id: string;
    itemCount: number;
    items: CartDataItem[];
  };
};

export type RunItemStatus =
  | "added"
  | "skipped_already_present"
  | "skipped_missing_on_sameday"
  | "failed";

export type RunItem = {
  product_id: string;
  instacart_item_id: string;
  name: string;
  intended_quantity: number;
  final_quantity: number | null;
  status: RunItemStatus;
  reason: string | null;
  instacart_price: string | null;
  sameday_price: string | null;
};

export type RunResult = {
  started_at: string;
  ended_at: string;
  outcome: "success" | "partial" | "failure";
  instacart: {
    user_id: string;
    guest: boolean;
    cart_id: string;
    item_count: number;
  };
  sameday: {
    user_id: string;
    guest: boolean;
    cart_id: string;
    item_count_before: number;
    item_count_after: number;
  };
  items: RunItem[];
  warnings: string[];
};

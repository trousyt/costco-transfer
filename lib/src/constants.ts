// Persisted-query hashes observed on 2026-04-19. Both domains share them.
export const HASH = {
  CurrentUserFields: "d7d1050d8a8efb9a24d2fd0d9c39f58d852ab84ea709370bcbedbca790112952",
  CartSwitcherSingleRetailerCartIds: "5915621492913130fa5840efd7298d57f99aa5fd28ad964cb4b3ec4e34f7eab2",
  CartData: "05e3d7448576ff7d464c9244fb6687fabd1bdeee85fdf817e85487003cdb6d44",
  Items: "5116339819ff07f207fd38f949a8a7f58e52cc62223b535405b087e3076ebf2f",
} as const;

// Costco is retailer_id 5, location 11641, Instacart shop 14291, zone 488.
// These were stable across Instacart and Sameday in the 2026-04-19 spike.
export const COSTCO = {
  retailerId: "5",
  retailerLocationId: "11641",
  shopId: "14291",
  zoneId: "488",
  postalCode: "85704",
} as const;

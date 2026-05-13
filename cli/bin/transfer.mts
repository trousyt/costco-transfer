#!/usr/bin/env node
// Costco cart transfer — Instacart → Sameday (single-shot, deterministic).
// Requires Chrome running at http://localhost:9222 with both sites logged in.

import CDP from "chrome-remote-interface";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  HASH,
  COSTCO,
  renderReconcileMd,
  pagePreflight,
  pageReadCartId,
  pageReadCartData,
  pageReadItems,
  pageFireMutation,
} from "@costco-transfer/lib";
import type {
  CartDataItem,
  FireMutationResult,
  RunResult,
} from "@costco-transfer/lib/types";

const CDP_PORT = 9222;
const INSTACART_URL = "https://www.instacart.com/store/costco/storefront";
const SAMEDAY_URL = "https://sameday.costco.com/store/costco/storefront";

// --- CDP plumbing -----------------------------------------------------------

type Client = Awaited<ReturnType<typeof CDP>>;
type TabTarget = { id: string; type: string; url: string; webSocketDebuggerUrl?: string };

async function findOrOpenTab(urlPrefix: string, targetUrl: string): Promise<Client> {
  const tabs = (await CDP.List({ port: CDP_PORT })) as unknown as TabTarget[];
  let tab = tabs.find((t) => t.type === "page" && typeof t.url === "string" && t.url.startsWith(urlPrefix));
  if (!tab) {
    const created = (await CDP.New({ port: CDP_PORT, url: targetUrl })) as unknown as TabTarget;
    tab = { ...created, type: "page" };
  }
  const client = await CDP({ port: CDP_PORT, target: tab.id });
  await client.Page.enable();
  await client.Runtime.enable();
  const { result: loc } = await client.Runtime.evaluate({ expression: "location.href", returnByValue: true });
  const href = (loc.value as string) || "";
  if (!href.startsWith(urlPrefix)) {
    await client.Page.navigate({ url: targetUrl });
    await client.Page.loadEventFired();
  }
  return client;
}

/** Run a function inside the target tab with arg serialization. Throws on page-side exceptions. */
async function evalInTab<A, R>(
  client: Client,
  fn: (arg: A) => R | Promise<R>,
  arg: A,
): Promise<R> {
  const expression = `(${fn.toString()})(${JSON.stringify(arg)})`;
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (exceptionDetails) {
    const msg = exceptionDetails.exception?.description
      || exceptionDetails.text
      || "unknown page exception";
    throw new Error(`evalInTab failed: ${msg}`);
  }
  return result.value as R;
}

// --- Main flow --------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];

  let ic: Client | undefined, sd: Client | undefined;
  try {
    ic = await findOrOpenTab("https://www.instacart.com/", INSTACART_URL);
    sd = await findOrOpenTab("https://sameday.costco.com/", SAMEDAY_URL);
  } catch (e) {
    fail(`Cannot attach to Chrome on :${CDP_PORT}. Run scripts\\start-costco-chrome.cmd first. (${(e as Error).message})`, 2);
  }

  try {
    // Preflight
    const icUser = await evalInTab(ic!, pagePreflight, { hash: HASH.CurrentUserFields });
    const sdUser = await evalInTab(sd!, pagePreflight, { hash: HASH.CurrentUserFields });
    if (!icUser.user_id) fail("Instacart is not logged in. Open the debug Chrome and sign in to instacart.com.", 2);
    if (icUser.guest) warnings.push("Instacart session is a guest; cart may be empty or unexpected.");

    // Extract
    const icCartId = (await evalInTab(ic!, pageReadCartId, { hash: HASH.CartSwitcherSingleRetailerCartIds, retailerId: COSTCO.retailerId })).cart_id;
    if (!icCartId) fail("No Costco cart found on Instacart.", 3);
    const icCart = await evalInTab(ic!, pageReadCartData, { hash: HASH.CartData, cartId: icCartId });
    if (icCart.item_count === 0) fail("Instacart cart is empty; nothing to transfer.", 3);
    const icIds = icCart.items.map((i) => i.v4ItemId);
    const icItems = await evalInTab(ic!, pageReadItems, {
      hash: HASH.Items, ids: icIds, shopId: COSTCO.shopId, zoneId: COSTCO.zoneId, postalCode: COSTCO.postalCode,
    });

    // Match on sameday
    const sdItems = await evalInTab(sd!, pageReadItems, {
      hash: HASH.Items, ids: icIds, shopId: COSTCO.shopId, zoneId: COSTCO.zoneId, postalCode: COSTCO.postalCode,
    });
    const sdById = new Map(sdItems.items.map((it) => [it.product_id, it]));
    const icById = new Map(icItems.items.map((it) => [it.product_id, it]));

    // Read sameday cart_id + current state (additive-only).
    // Mutation creates a new cart if we pass null.
    const sdCartIdInitial = (await evalInTab(sd!, pageReadCartId, { hash: HASH.CartSwitcherSingleRetailerCartIds, retailerId: COSTCO.retailerId })).cart_id;
    let sdItemCountBefore = 0;
    let sdByPid = new Map<string, CartDataItem>();
    if (sdCartIdInitial) {
      const sdBefore = await evalInTab(sd!, pageReadCartData, { hash: HASH.CartData, cartId: sdCartIdInitial });
      sdItemCountBefore = sdBefore.item_count;
      sdByPid = new Map(sdBefore.items.map((ci) => [ci.productId, ci]));
    } else {
      warnings.push("Sameday has no cart yet; the mutation will create one.");
    }

    // Plan items
    const plan = icCart.items.map((ci) => {
      const sdMeta = sdById.get(ci.productId);
      const present = sdByPid.get(ci.productId);
      if (!sdMeta) return { ci, decision: "missing" as const };
      if (present) return { ci, decision: "already" as const };
      if (sdMeta.available === false) return { ci, decision: "missing" as const };
      return { ci, decision: "add" as const };
    });

    const toAdd = plan.filter((p) => p.decision === "add");
    let addOutcome: FireMutationResult = { ok: true };
    if (toAdd.length > 0) {
      addOutcome = await evalInTab(sd!, pageFireMutation, {
        cartId: sdCartIdInitial,
        cartType: "grocery",
        cartItemUpdates: toAdd.map((p) => ({
          itemId: p.ci.v4ItemId,
          quantity: p.ci.quantity,
          quantityType: p.ci.quantityType,
        })),
      });
    }

    // Resolve final sameday cart_id (mutation returns cart.id even for new carts).
    const sdCartId: string = addOutcome.cart?.id ?? sdCartIdInitial ?? "";
    if (!sdCartId) fail("No sameday cart_id available after mutation.", 3);

    // Verify
    const sdAfter = sdCartId
      ? await evalInTab(sd!, pageReadCartData, { hash: HASH.CartData, cartId: sdCartId })
      : { item_count: 0, items: [] as CartDataItem[] };
    const sdAfterByPid = new Map(sdAfter.items.map((ci) => [ci.productId, ci]));

    // Build reconcile items
    const items: RunResult["items"] = plan.map((p) => {
      const pid = p.ci.productId;
      const icMeta = icById.get(pid);
      const sdMeta = sdById.get(pid);
      const after = sdAfterByPid.get(pid);
      const base = {
        product_id: pid,
        instacart_item_id: p.ci.v4ItemId,
        name: icMeta?.name ?? `(unknown: ${pid})`,
        intended_quantity: p.ci.quantity,
        instacart_price: icMeta?.price ?? null,
        sameday_price: sdMeta?.price ?? null,
      };
      if (p.decision === "missing")  return { ...base, final_quantity: null, status: "skipped_missing_on_sameday", reason: sdMeta ? "out of stock" : "not in sameday catalog" };
      if (p.decision === "already")  return { ...base, final_quantity: after?.quantity ?? null, status: "skipped_already_present", reason: null };
      if (!addOutcome.ok)            return { ...base, final_quantity: after?.quantity ?? null, status: "failed", reason: addOutcome.error ?? "unknown" };
      const ok = !!after && after.quantity >= p.ci.quantity;
      return ok
        ? { ...base, final_quantity: after!.quantity, status: "added", reason: null }
        : { ...base, final_quantity: after?.quantity ?? null, status: "failed", reason: "not present in sameday cart after mutation" };
    });

    const anyFailed = items.some((i) => i.status === "failed");
    const anyAdded  = items.some((i) => i.status === "added");
    const outcome: RunResult["outcome"] = anyFailed ? (anyAdded ? "partial" : "failure") : "success";
    if (!addOutcome.ok) warnings.push(`Mutation error: ${addOutcome.error}`);

    const result: RunResult = {
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      outcome,
      instacart: { user_id: icUser.user_id!, guest: !!icUser.guest, cart_id: icCartId, item_count: icCart.item_count },
      sameday:   { user_id: sdUser.user_id ?? "", guest: !!sdUser.guest, cart_id: sdCartId, item_count_before: sdItemCountBefore, item_count_after: sdAfter.item_count },
      items,
      warnings,
    };

    // Artifacts
    const date = startedAt.slice(0, 10);
    const cwd = process.cwd();
    const cartFile      = join(cwd, `costco-cart-${date}.json`);
    const matchFile     = join(cwd, `costco-cart-${date}-match.json`);
    const reconcileFile = join(cwd, `costco-cart-${date}-reconcile.md`);

    await writeFile(cartFile, JSON.stringify({
      source: "instacart.com/store/costco",
      captured_at: startedAt,
      cart_id: icCartId,
      shop_id: COSTCO.shopId,
      retailer_id: COSTCO.retailerId,
      retailer_location_id: COSTCO.retailerLocationId,
      user: { id: icUser.user_id, guest: !!icUser.guest },
      items: icCart.items.map((ci) => {
        const meta = icById.get(ci.productId);
        return {
          instacart_item_id: ci.v4ItemId,
          product_id: ci.productId,
          legacy_id: meta?.legacy_id ?? null,
          name: meta?.name ?? `(unknown: ${ci.productId})`,
          brand: meta?.brand ?? null,
          size: meta?.size ?? null,
          quantity: ci.quantity,
          quantity_type: ci.quantityType,
          unit_price: meta?.price ?? null,
          full_price: meta?.full_price ?? null,
        };
      }),
    }, null, 2));

    await writeFile(matchFile, JSON.stringify({
      generated_at: new Date().toISOString(),
      strategy: "id-1-to-1",
      matched: icCart.items.filter((ci) => sdById.has(ci.productId)).map((ci) => {
        const sdMeta = sdById.get(ci.productId)!;
        return {
          product_id: ci.productId,
          sameday_product_id: sdMeta.product_id,
          sameday_url: `https://sameday.costco.com/store/costco/products/${ci.productId}`,
          name: sdMeta.name,
          confidence: "exact",
          sameday_price: sdMeta.price,
          instacart_price: icById.get(ci.productId)?.price ?? null,
        };
      }),
      missing: icCart.items.filter((ci) => !sdById.has(ci.productId)).map((ci) => ({
        product_id: ci.productId,
        instacart_item_id: ci.v4ItemId,
        name: icById.get(ci.productId)?.name ?? null,
        reason: "not in sameday catalog",
      })),
    }, null, 2));

    await writeFile(reconcileFile, renderReconcileMd(result));

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");

    await ic!.close();
    await sd!.close();
    process.exit(outcome === "failure" ? 1 : 0);
  } catch (e) {
    await ic?.close().catch(() => {});
    await sd?.close().catch(() => {});
    fail(`Unhandled: ${(e as Error).message}`, 1);
  }
}

function fail(msg: string, code: number): never {
  process.stderr.write(JSON.stringify({ error: msg, code }) + "\n");
  process.exit(code);
}

main();

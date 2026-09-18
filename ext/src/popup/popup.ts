// Popup orchestrator. Uses chrome.scripting.executeScript to run the shared
// page-side functions inside the Instacart and Sameday tabs.

import {
  HASH,
  COSTCO,
  pagePreflight,
  pageReadCartId,
  pageReadCartData,
  pageReadItems,
  pageFireMutation,
} from "@costco-transfer/lib";
import type {
  CartDataItem,
  FireMutationResult,
  RunItem,
  RunResult,
} from "@costco-transfer/lib/types";

// --- DOM helpers ------------------------------------------------------------

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing: ${sel}`);
  return el as T;
};

const statusEl = $<HTMLElement>("#status");
const statusKicker = $<HTMLElement>("#status-kicker");
const statusTitle = $<HTMLElement>("#status-title");
const statusIco = $<HTMLElement>("#status-ico");
const statusTrack = $<HTMLElement>("#status-track");
const routeDot = $<HTMLElement>("#route-dot");
const controls = $<HTMLElement>("#controls");
const transferBtn = $<HTMLButtonElement>("#transfer");
const openIcBtn = $<HTMLButtonElement>("#open-instacart");
const openSdBtn = $<HTMLButtonElement>("#open-sameday");
const resultEl = $<HTMLElement>("#result");
const resultOutcome = $<HTMLElement>("#result-outcome");
const resultSummary = $<HTMLElement>("#result-summary");
const resultCounts = $<HTMLElement>("#result-counts");
const resultTableBody = $<HTMLElement>("#result-table tbody");
const resultWarnings = $<HTMLElement>("#result-warnings");
const historyEl = $<HTMLElement>("#history");
const historyList = $<HTMLElement>("#history-list");
const historyCount = $<HTMLElement>("#history-count");
const clearHistoryBtn = $<HTMLButtonElement>("#clear-history");
const clearIcBtn = $<HTMLButtonElement>("#clear-instacart");
const clearConfirmEl = $<HTMLElement>("#clear-confirm");
const clearConfirmYesBtn = $<HTMLButtonElement>("#clear-confirm-yes");
const clearConfirmNoBtn = $<HTMLButtonElement>("#clear-confirm-no");

// Status-block glyphs (static markup → innerHTML is safe; no user data).
const GLYPH = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
} as const;

type StatusKind = "idle" | "ready" | "working" | "ok" | "warn" | "bad";

// Maps the orchestrator's status kinds onto the design system's status-block
// variants (left-edge color, kicker, leading glyph). "ready"/"working"/"done"/
// "error" mirror the documented states; "idle"=waiting, "warn"=partial outcome.
const STATUS_META: Record<StatusKind, { variant: string; kicker: string; glyph: string; progress?: boolean }> = {
  idle:    { variant: "s-info",     kicker: "Action needed",  glyph: GLYPH.info },
  ready:   { variant: "s-ready",    kicker: "Ready",          glyph: GLYPH.swap },
  working: { variant: "s-progress", kicker: "Working",        glyph: GLYPH.spinner, progress: true },
  ok:      { variant: "s-done",     kicker: "Complete",       glyph: GLYPH.check },
  warn:    { variant: "s-warn",     kicker: "Heads up",       glyph: GLYPH.warn },
  bad:     { variant: "s-error",    kicker: "Can't continue", glyph: GLYPH.warn },
};

function setStatus(kind: StatusKind, title: string, opts: { kicker?: string } = {}) {
  const meta = STATUS_META[kind];
  statusEl.className = `status ${meta.variant}`;
  statusKicker.textContent = opts.kicker ?? meta.kicker;
  statusTitle.textContent = title;
  statusIco.innerHTML = meta.glyph;
  const showProgress = !!meta.progress;
  statusTrack.hidden = !showProgress;
  statusTrack.classList.toggle("indeterminate", showProgress);
}

// --- Tab helpers ------------------------------------------------------------

const INSTACART_URL = "https://www.instacart.com/store/costco/storefront";
const SAMEDAY_URL = "https://sameday.costco.com/store/costco/storefront";

async function findTab(urlPrefix: string): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: `${urlPrefix}*` });
  return tabs[0] ?? null;
}

async function openTab(url: string): Promise<chrome.tabs.Tab> {
  return await chrome.tabs.create({ url, active: false });
}

// --- executeScript helper ---------------------------------------------------

type World = "ISOLATED" | "MAIN";

async function runInTab<A, R>(
  tabId: number,
  world: World,
  func: (arg: A) => R | Promise<R>,
  arg: A,
): Promise<R> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world,
    func: func as (arg: unknown) => unknown,
    args: [arg],
  });
  if (!res) throw new Error("executeScript returned no result");
  return res.result as R;
}

// --- History storage ---------------------------------------------------------

const HISTORY_KEY = "transfer_history";
const HISTORY_MAX = 20;

async function saveToHistory(r: RunResult): Promise<void> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const history: RunResult[] = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  history.unshift(r);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

async function loadHistory(): Promise<void> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const history: RunResult[] = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  historyEl.hidden = history.length === 0;
  historyCount.textContent = history.length ? String(history.length) : "";
  historyList.replaceChildren(...history.map(buildHistoryItem));
}

function buildItemRows(items: RunItem[]): HTMLTableRowElement[] {
  return items.map((it) => {
    const tr = document.createElement("tr");
    tr.append(
      td(it.status),
      td(it.name),
      td(String(it.intended_quantity)),
      td(it.instacart_price ?? "—"),
      td(it.sameday_price ?? "—"),
    );
    return tr;
  });
}

// Maps a run outcome to the design system's status tone (edge bar + pill).
function outcomeTone(outcome: RunResult["outcome"]): { tone: "ok" | "warn" | "bad"; label: string } {
  if (outcome === "success") return { tone: "ok", label: "Success" };
  if (outcome === "partial") return { tone: "warn", label: "Partial" };
  return { tone: "bad", label: "Failed" };
}

// One ".stat" block (mono figure + label). Zero values dim to --faint so
// non-zero counts pop, per the design system.
function statBlock(kind: "added" | "skipped" | "failed", n: number): HTMLElement {
  const el = document.createElement("span");
  el.className = `stat ${kind}${n === 0 ? " zero" : ""}`;
  const b = document.createElement("b");
  b.textContent = String(n);
  const label = document.createElement("span");
  label.textContent = kind;
  el.append(b, label);
  return el;
}

function buildHistoryItem(r: RunResult): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "history-item";

  const added   = r.items.filter((i) => i.status === "added").length;
  const skipped = r.items.filter((i) => i.status.startsWith("skipped_")).length;
  const failed  = r.items.filter((i) => i.status === "failed").length;
  const { tone, label } = outcomeTone(r.outcome);

  // Summary = the design's ".hrow"; expanding reveals the per-item table (extra).
  const summary = document.createElement("summary");
  summary.className = "hrow";

  const bar = document.createElement("span");
  bar.className = `hbar ${tone}`;

  const top = document.createElement("div");
  top.className = "hrow-top";
  const when = document.createElement("span");
  when.className = "hwhen";
  when.textContent = new Date(r.started_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const pill = document.createElement("span");
  pill.className = `hpill ${tone}`;
  pill.textContent = label;
  top.append(when, pill);

  const stats = document.createElement("div");
  stats.className = "hstats";
  stats.append(statBlock("added", added), statBlock("skipped", skipped), statBlock("failed", failed));

  summary.append(bar, top, stats);

  const table = document.createElement("table");
  table.className = "h-table";
  const thead = document.createElement("thead");
  const hrow = document.createElement("tr");
  ["Status", "Product", "Qty", "IC $", "SD $"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    hrow.append(th);
  });
  thead.append(hrow);
  const tbody = document.createElement("tbody");
  tbody.append(...buildItemRows(r.items));
  table.append(thead, tbody);

  const warnDiv = document.createElement("div");
  warnDiv.className = "h-warnings";
  r.warnings.forEach((w) => {
    const d = document.createElement("div");
    d.textContent = w;
    warnDiv.append(d);
  });

  details.append(summary, table, warnDiv);
  return details;
}

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(HISTORY_KEY);
  await loadHistory();
});

// --- DOM builders (typed + xss-safe) ----------------------------------------

function td(text: string): HTMLTableCellElement {
  const el = document.createElement("td");
  el.textContent = text;
  return el;
}

function countBlock(label: string, n: number): HTMLElement {
  const span = document.createElement("span");
  span.className = "stat";
  const b = document.createElement("b");
  b.textContent = String(n);
  const l = document.createElement("span");
  l.textContent = label;
  span.append(b, l);
  return span;
}

// --- Main orchestration -----------------------------------------------------

async function detectAndWire() {
  setStatus("working", "Finding tabs…");
  const [ic, sd] = await Promise.all([
    findTab("https://www.instacart.com/"),
    findTab("https://sameday.costco.com/"),
  ]);

  openIcBtn.hidden = !!ic;
  openSdBtn.hidden = !!sd;
  transferBtn.disabled = !(ic && sd);
  clearIcBtn.hidden = !ic;
  clearConfirmEl.hidden = true;

  const bothReady = !!(ic && sd);
  routeDot.className = bothReady ? "ph-dot live" : "ph-dot warn";

  if (!ic && !sd) setStatus("idle", "Open an Instacart Costco tab and a Sameday tab.");
  else if (!ic)   setStatus("idle", "Open an Instacart Costco tab.");
  else if (!sd)   setStatus("idle", "Open a Sameday tab.");
  else            setStatus("ready", "Ready — click Transfer to begin.");

  controls.hidden = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

openIcBtn.addEventListener("click", async () => {
  await openTab(INSTACART_URL);
  await sleep(600);
  await detectAndWire();
});
openSdBtn.addEventListener("click", async () => {
  await openTab(SAMEDAY_URL);
  await sleep(600);
  await detectAndWire();
});
transferBtn.addEventListener("click", runTransfer);

async function runTransfer() {
  resultEl.hidden = true;
  transferBtn.disabled = true;
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];

  try {
    const ic = await findTab("https://www.instacart.com/");
    const sd = await findTab("https://sameday.costco.com/");
    if (!ic?.id || !sd?.id) throw new Error("Tab closed during transfer");

    // Preflight
    setStatus("working", "Checking auth…");
    const icUser = await runInTab(ic.id, "ISOLATED", pagePreflight, { hash: HASH.CurrentUserFields });
    const sdUser = await runInTab(sd.id, "ISOLATED", pagePreflight, { hash: HASH.CurrentUserFields });
    if (!icUser.user_id) throw new Error("Instacart is not logged in. Sign in first, then try again.");
    if (icUser.guest) warnings.push("Instacart session is a guest; cart may be empty or unexpected.");
    if (sdUser.guest) warnings.push("Sameday session is a guest; prices shown reflect guest (not member) pricing and the cart may not persist. Sign in to Sameday before transferring.");

    // Extract
    setStatus("working", "Reading Instacart cart…");
    const icCartIdR = await runInTab(ic.id, "ISOLATED", pageReadCartId, {
      hash: HASH.CartSwitcherSingleRetailerCartIds, retailerId: COSTCO.retailerId,
    });
    const icCartId = icCartIdR.cart_id;
    if (!icCartId) throw new Error("No Costco cart found on Instacart.");
    const icCart = await runInTab(ic.id, "ISOLATED", pageReadCartData, { hash: HASH.CartData, cartId: icCartId });
    if (icCart.item_count === 0) throw new Error("Instacart cart is empty; nothing to transfer.");
    const icIds = icCart.items.map((i) => i.v4ItemId);
    const icItems = await runInTab(ic.id, "ISOLATED", pageReadItems, {
      hash: HASH.Items, ids: icIds, shopId: COSTCO.shopId, zoneId: COSTCO.zoneId, postalCode: COSTCO.postalCode,
    });

    // Match on Sameday
    setStatus("working", "Matching items on Sameday…");
    const sdItems = await runInTab(sd.id, "ISOLATED", pageReadItems, {
      hash: HASH.Items, ids: icIds, shopId: COSTCO.shopId, zoneId: COSTCO.zoneId, postalCode: COSTCO.postalCode,
    });
    const sdById = new Map(sdItems.items.map((it) => [it.product_id, it]));
    const icById = new Map(icItems.items.map((it) => [it.product_id, it]));

    // Sameday cart state
    setStatus("working", "Reading Sameday cart…");
    const sdCartIdR = await runInTab(sd.id, "ISOLATED", pageReadCartId, {
      hash: HASH.CartSwitcherSingleRetailerCartIds, retailerId: COSTCO.retailerId,
    });
    const sdCartIdInitial = sdCartIdR.cart_id;
    let sdItemCountBefore = 0;
    let sdByPid = new Map<string, CartDataItem>();
    if (sdCartIdInitial) {
      const sdBefore = await runInTab(sd.id, "ISOLATED", pageReadCartData, { hash: HASH.CartData, cartId: sdCartIdInitial });
      sdItemCountBefore = sdBefore.item_count;
      sdByPid = new Map(sdBefore.items.map((ci) => [ci.productId, ci]));
    } else {
      warnings.push("Sameday has no cart yet; the mutation will create one.");
    }

    // Plan
    const plan = icCart.items.map((ci) => {
      const sdMeta = sdById.get(ci.productId);
      const present = sdByPid.get(ci.productId);
      if (!sdMeta) return { ci, decision: "missing" as const };
      if (present) return { ci, decision: "already" as const };
      if (sdMeta.available === false) return { ci, decision: "missing" as const };
      return { ci, decision: "add" as const };
    });

    // Fire mutation
    const toAdd = plan.filter((p) => p.decision === "add");
    let addOutcome: FireMutationResult = { ok: true };
    if (toAdd.length > 0) {
      setStatus("working", `Adding ${toAdd.length} item${toAdd.length === 1 ? "" : "s"} to Sameday…`);
      addOutcome = await runInTab(sd.id, "MAIN", pageFireMutation, {
        cartId: sdCartIdInitial,
        cartType: "grocery",
        cartItemUpdates: toAdd.map((p) => ({
          itemId: p.ci.v4ItemId,
          quantity: p.ci.quantity,
          quantityType: p.ci.quantityType,
        })),
      });
      if (!addOutcome.ok) throw new Error(`Mutation failed: ${addOutcome.error}`);
    }

    const sdCartId: string = addOutcome.cart?.id ?? sdCartIdInitial ?? "";
    if (!sdCartId) {
      if (toAdd.length === 0) throw new Error("No items to transfer (all unavailable on Sameday) and no existing Sameday cart found.");
      throw new Error("No Sameday cart_id available after mutation.");
    }

    // Verify
    setStatus("working", "Verifying…");
    const sdAfter = await runInTab(sd.id, "ISOLATED", pageReadCartData, { hash: HASH.CartData, cartId: sdCartId });
    const sdAfterByPid = new Map(sdAfter.items.map((ci) => [ci.productId, ci]));

    const items: RunItem[] = plan.map((p) => {
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
      if (p.decision === "missing")
        return { ...base, final_quantity: null, status: "skipped_missing_on_sameday", reason: sdMeta ? "out of stock" : "not in sameday catalog" };
      if (p.decision === "already")
        return { ...base, final_quantity: after?.quantity ?? null, status: "skipped_already_present", reason: null };
      if (!addOutcome.ok)
        return { ...base, final_quantity: after?.quantity ?? null, status: "failed", reason: addOutcome.error ?? "unknown" };
      const ok = !!after && after.quantity >= p.ci.quantity;
      return ok
        ? { ...base, final_quantity: after!.quantity, status: "added", reason: null }
        : { ...base, final_quantity: after?.quantity ?? null, status: "failed", reason: "not present in sameday cart after mutation" };
    });

    const anyFailed = items.some((i) => i.status === "failed");
    const anyAdded = items.some((i) => i.status === "added");
    const outcome: RunResult["outcome"] = anyFailed ? (anyAdded ? "partial" : "failure") : "success";
    if (!addOutcome.ok) warnings.push(`Mutation error: ${addOutcome.error}`);

    const result: RunResult = {
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      outcome,
      instacart: {
        user_id: icUser.user_id!,
        guest: !!icUser.guest,
        cart_id: icCartId,
        item_count: icCart.item_count,
      },
      sameday: {
        user_id: sdUser.user_id ?? "",
        guest: !!sdUser.guest,
        cart_id: sdCartId,
        item_count_before: sdItemCountBefore,
        item_count_after: sdAfter.item_count,
      },
      items,
      warnings,
    };

    renderResult(result);
    await saveToHistory(result);
    await loadHistory();
  } catch (e) {
    setStatus("bad", (e as Error).message || String(e));
  } finally {
    transferBtn.disabled = false;
  }
}

function renderResult(r: RunResult) {
  const counts = {
    added: r.items.filter((i) => i.status === "added").length,
    already: r.items.filter((i) => i.status === "skipped_already_present").length,
    missing: r.items.filter((i) => i.status === "skipped_missing_on_sameday").length,
    failed: r.items.filter((i) => i.status === "failed").length,
  };
  setStatus(r.outcome === "failure" ? "bad" : r.outcome === "partial" ? "warn" : "ok", `Transfer ${r.outcome}.`);
  resultEl.hidden = false;
  resultOutcome.textContent = `${r.sameday.item_count_before} → ${r.sameday.item_count_after} items on Sameday`;
  resultSummary.textContent =
    `Instacart cart (${r.instacart.guest ? "guest" : "member"}): ${r.instacart.item_count} items. ` +
    `Sameday cart (${r.sameday.guest ? "guest" : "member"}): ${r.sameday.cart_id}.`;

  resultCounts.replaceChildren(
    countBlock("Added", counts.added),
    countBlock("Already present", counts.already),
    countBlock("Missing", counts.missing),
    countBlock("Failed", counts.failed),
  );

  resultTableBody.replaceChildren(...buildItemRows(r.items));

  resultWarnings.replaceChildren(
    ...r.warnings.map((w) => {
      const d = document.createElement("div");
      d.textContent = w;
      return d;
    }),
  );
}

clearIcBtn.addEventListener("click", () => {
  clearIcBtn.hidden = true;
  clearConfirmEl.hidden = false;
});
clearConfirmNoBtn.addEventListener("click", () => {
  clearConfirmEl.hidden = true;
  clearIcBtn.hidden = false;
});
clearConfirmYesBtn.addEventListener("click", runClearCart);

async function runClearCart() {
  clearConfirmEl.hidden = true;
  clearIcBtn.disabled = true;

  try {
    const ic = await findTab("https://www.instacart.com/");
    if (!ic?.id) throw new Error("Instacart tab not found.");

    setStatus("working", "Reading Instacart cart…");
    const cartIdR = await runInTab(ic.id, "ISOLATED", pageReadCartId, {
      hash: HASH.CartSwitcherSingleRetailerCartIds,
      retailerId: COSTCO.retailerId,
    });
    if (!cartIdR.cart_id) throw new Error("No Costco cart found on Instacart.");

    const cart = await runInTab(ic.id, "ISOLATED", pageReadCartData, {
      hash: HASH.CartData,
      cartId: cartIdR.cart_id,
    });

    if (cart.item_count === 0) {
      setStatus("ok", "Instacart cart is already empty.");
      return;
    }

    setStatus("working", `Clearing ${cart.item_count} item${cart.item_count === 1 ? "" : "s"}…`);

    const outcome = await runInTab(ic.id, "MAIN", pageFireMutation, {
      cartId: cartIdR.cart_id,
      cartType: "grocery",
      cartItemUpdates: cart.items.map((item) => ({
        itemId: item.v4ItemId,
        quantity: 0,
        quantityType: item.quantityType,
      })),
    });

    if (!outcome.ok) throw new Error(`Clear failed: ${outcome.error}`);
    setStatus("ok", `Cleared ${cart.item_count} item${cart.item_count === 1 ? "" : "s"} from Instacart cart.`);
    await chrome.tabs.reload(ic.id);
  } catch (e) {
    setStatus("bad", (e as Error).message || String(e));
  } finally {
    clearIcBtn.hidden = false;
    clearIcBtn.disabled = false;
  }
}

// Init
detectAndWire().catch((e) => setStatus("bad", (e as Error).message));
loadHistory().catch(() => {});

# costco-transfer

Transfer an active cart from **instacart.com/store/costco** to **sameday.costco.com/store** in one shot.

Both sites share the Instacart GraphQL backend with identical product IDs, so the tool:

1. reads the Instacart cart via persisted GraphQL queries,
2. fires a single `UpdateCartItemsMutation` against sameday's GraphQL to add the items.

One mutation moves the whole cart. No UI automation, no paste-in, no per-item loops.

## Repo layout

This is an npm-workspaces monorepo with two entry points on top of one shared library.

```
costco-transfer/
├─ lib/   @costco-transfer/lib   — shared types, hashes, page-side fns, reconcile
├─ cli/   costco-transfer-cli    — Node CLI (CDP-driven, good for agent/headless use)
└─ ext/   costco-transfer-ext    — Chrome extension MV3 (recommended for humans)
```

Pick one entry point:

### Extension (one-click, recommended for humans)

Prereqs: Google Chrome. You are already signed in to Instacart in your normal browser.

```cmd
cd C:\Projects\github\costco-transfer
npm install
npm run build:ext
```

Then in Chrome:

1. `chrome://extensions` → enable **Developer mode**.
2. Click **Load unpacked**, pick `C:\Projects\github\costco-transfer\ext\`.
3. Pin the **Costco Cart Transfer** icon to the toolbar.
4. Open Instacart Costco + Sameday (ZIP-gated page is fine). Click the icon → **Transfer cart**.

For ongoing dev: `npm run watch:ext` in one terminal, then press the 🔄 button on the extension card after edits.

### CLI (for agents, automation, headless)

Prereqs: Node **22.6+** (22.14 on this machine uses `--experimental-strip-types`; 23.6+ doesn't need the flag). Plus a separate debug Chrome profile (so your real session stays untouched).

```cmd
cd C:\Projects\github\costco-transfer
npm install
cd cli
scripts\start-costco-chrome.cmd
rem log in to both sites in the launched Chrome, then:
npm start
```

Writes three artifacts to the CLI's cwd:

- `costco-cart-<date>.json` — Instacart snapshot.
- `costco-cart-<date>-match.json` — sameday match report.
- `costco-cart-<date>-reconcile.md` — summary.

Structured run result as JSON on stdout.

## Shared semantics (both entry points)

- **Additive only.** Never removes or decreases items from sameday.
- **Best-effort partial failure.** OOS / per-order-cap items land in the report; the rest still transfer.
- **Blind price transfer.** Sameday prices differ from Instacart; deltas show in the report, not a confirmation step.

## Why two entry points?

The extension is the low-friction path — your real browser, your real session. The CLI remains useful when Claude (or another agent) needs to drive the transfer through an MCP tool without a human click, or for scheduled/headless runs later.

Both share `@costco-transfer/lib` so there's no drift in hashes, mutation logic, or report rendering.

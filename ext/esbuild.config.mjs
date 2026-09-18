#!/usr/bin/env node
// Builds the extension into ext/dist/.
// - popup.ts + background.ts → ESM bundles
// - popup.html + popup.css are copied verbatim
//
// The extension does NOT need separate page-entry scripts: popup.ts imports the
// page-side functions from @costco-transfer/lib and passes them to
// chrome.scripting.executeScript({func}). Chrome serializes the function via
// .toString() and injects it into the target tab's world.

import * as esbuild from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { genIcons } from "./scripts/gen-icons.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "src");
const distDir = join(here, "dist");
const watch = process.argv.includes("--watch");

await mkdir(distDir, { recursive: true });

// Static assets
await cp(join(srcDir, "popup", "popup.html"), join(distDir, "popup.html"));
await cp(join(srcDir, "popup", "popup.css"), join(distDir, "popup.css"));

// Make dist self-contained so it can be loaded directly as an unpacked
// extension. The source manifest lives one directory above dist, so remove
// that prefix from paths when copying it into the build directory.
const manifest = JSON.parse(await readFile(join(here, "manifest.json"), "utf8"));
const action = manifest.action;
if (action?.default_popup === "dist/popup.html") action.default_popup = "popup.html";
if (action?.default_icon && typeof action.default_icon === "object") {
  action.default_icon = Object.fromEntries(
    Object.entries(action.default_icon).map(([size, path]) => [size, path.replace(/^dist\//, "")]),
  );
}
if (manifest.icons && typeof manifest.icons === "object") {
  manifest.icons = Object.fromEntries(
    Object.entries(manifest.icons).map(([size, path]) => [size, path.replace(/^dist\//, "")]),
  );
}
manifest.background = { ...manifest.background, service_worker: "background.js" };
await writeFile(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// Brand icons → dist/icons/*.png (16/32/48/128)
await genIcons();

const common = {
  bundle: true,
  target: "chrome120",
  logLevel: "info",
  sourcemap: "inline",
  format: "esm",
};

const configs = [
  { ...common, entryPoints: [{ in: join(srcDir, "popup", "popup.ts"), out: "popup" }], outdir: distDir },
  { ...common, entryPoints: [{ in: join(srcDir, "background.ts"), out: "background" }], outdir: distDir },
];

if (watch) {
  for (const cfg of configs) {
    const ctx = await esbuild.context(cfg);
    await ctx.watch();
  }
  console.log("watching… (ctrl-c to stop)");
} else {
  for (const cfg of configs) {
    await esbuild.build(cfg);
  }
  console.log("ok — ext/dist/ built");
}

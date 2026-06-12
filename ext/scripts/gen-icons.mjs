// Rasterizes the brand SVG into manifest PNGs (16/32/48/128) in ext/dist/icons/.
// 16px uses a heavier stroke (3 instead of 2.4) for legibility, per the design system.

import { Resvg } from "@resvg/resvg-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = join(here, "..", "src", "assets", "icon.svg");
const outDir = join(here, "..", "dist", "icons");

const SIZES = [16, 32, 48, 128];

export async function genIcons() {
  const baseSvg = await readFile(svgPath, "utf8");
  await mkdir(outDir, { recursive: true });

  for (const size of SIZES) {
    // Bump stroke weight at the smallest size so the arrows stay legible.
    const svg = size <= 16 ? baseSvg.replace('stroke-width="2.4"', 'stroke-width="3"') : baseSvg;
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    await writeFile(join(outDir, `icon-${size}.png`), png);
  }
  console.log(`ok — ${SIZES.length} icons → ext/dist/icons/`);
}

// Allow running standalone: `node scripts/gen-icons.mjs`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-icons.mjs")) {
  genIcons().catch((e) => { console.error(e); process.exit(1); });
}

import type { RunResult } from "./types.ts";

export function renderReconcileMd(r: RunResult): string {
  const lines: string[] = [];
  lines.push(`# Costco Cart Transfer — ${r.started_at.slice(0, 10)}`);
  lines.push("");
  lines.push(`**Outcome:** ${r.outcome}`);
  lines.push("");
  lines.push(`| | Instacart | Sameday |`);
  lines.push(`|---|---|---|`);
  lines.push(
    `| User | ${r.instacart.user_id} (${r.instacart.guest ? "guest" : "member"}) | ${r.sameday.user_id} (${r.sameday.guest ? "guest" : "member"}) |`,
  );
  lines.push(`| Cart | ${r.instacart.cart_id} | ${r.sameday.cart_id} |`);
  lines.push(
    `| Items | ${r.instacart.item_count} | ${r.sameday.item_count_before} → ${r.sameday.item_count_after} |`,
  );
  lines.push("");
  const counts = {
    added: r.items.filter((i) => i.status === "added").length,
    already: r.items.filter((i) => i.status === "skipped_already_present").length,
    missing: r.items.filter((i) => i.status === "skipped_missing_on_sameday").length,
    failed: r.items.filter((i) => i.status === "failed").length,
  };
  lines.push(
    `**Added:** ${counts.added} · **Already present:** ${counts.already} · **Missing on sameday:** ${counts.missing} · **Failed:** ${counts.failed}`,
  );
  lines.push("");
  lines.push(`| Status | Product | Qty | Instacart $ | Sameday $ | Reason |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const it of r.items) {
    lines.push(
      `| ${it.status} | ${it.name} | ${it.intended_quantity} | ${it.instacart_price ?? "—"} | ${it.sameday_price ?? "—"} | ${it.reason ?? ""} |`,
    );
  }
  if (r.warnings.length) {
    lines.push("");
    lines.push(`## Warnings`);
    for (const w of r.warnings) lines.push(`- ${w}`);
  }
  return lines.join("\n") + "\n";
}

import type { PreflightArg, PreflightResult } from "../types.ts";

/**
 * Runs INSIDE a tab (either Instacart or Sameday).
 * Returns the current user's id + guest status by calling the CurrentUserFields persisted query.
 */
export async function pagePreflight(arg: PreflightArg): Promise<PreflightResult> {
  const ext = encodeURIComponent(
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: arg.hash } }),
  );
  const url = `/graphql?operationName=CurrentUserFields&variables=%7B%7D&extensions=${ext}`;
  const r = await fetch(url, {
    credentials: "include",
    headers: { "x-client-identifier": "web" },
  });
  const body = await r.json().catch(() => ({}));
  const cu = body?.data?.currentUser ?? null;
  return {
    user_id: cu?.id ?? null,
    guest: typeof cu?.guest === "boolean" ? cu.guest : null,
    email: cu?.email ?? null,
  };
}

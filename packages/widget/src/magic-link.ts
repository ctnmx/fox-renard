import { magicLinkParameter } from "@fox-renard/api/client";

/**
 * The token of the magic link this page was opened from, if any. It is taken
 * out of the address bar, so that it is neither followed twice nor shared.
 */
export function takeMagicLinkToken(): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get(
    magicLinkParameter,
  );
  if (token === null) return null;
  history.replaceState(history.state, "", location.pathname + location.search);
  return token;
}

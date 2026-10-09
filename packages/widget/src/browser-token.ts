// The token the API issued this browser for a Site, kept in local storage:
// Fox Renard sets no cookie. Each Site gets its own token (ADR-0005).

// Where local storage is unavailable, the token lasts as long as the page.
const unstored = new Map<string, string>();

function storageKey(siteId: string): string {
  return `fox-renard:browser-token:${siteId}`;
}

export function readBrowserToken(siteId: string): string | undefined {
  try {
    return localStorage.getItem(storageKey(siteId)) ?? unstored.get(siteId);
  } catch {
    return unstored.get(siteId);
  }
}

export function keepBrowserToken(siteId: string, browserToken: string): void {
  unstored.set(siteId, browserToken);
  try {
    localStorage.setItem(storageKey(siteId), browserToken);
  } catch {
    // Storage is disabled or full: the token stays in memory.
  }
}

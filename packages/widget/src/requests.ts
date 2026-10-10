import type { Client, WidgetData } from "@fox-renard/api/client";
import { keepBrowserToken, readBrowserToken } from "./browser-token";

/** The Page a Widget sits on, and the client that reaches its Site's API. */
export interface PageConnection {
  client: Client;
  siteId: string;
  pageKey: string;
}

/** Sends the browser token, once the API has issued one for the Site. */
function authorization(siteId: string) {
  const browserToken = readBrowserToken(siteId);
  return browserToken ? { authorization: `Bearer ${browserToken}` } : {};
}

/** What every request about the Page sends. */
function pageRequest({ client, siteId, pageKey }: PageConnection) {
  return {
    endpoints: client.v1.sites[":siteId"].pages[":pageKey"],
    param: { siteId, pageKey },
    header: authorization(siteId),
  };
}

export async function fetchWidgetData(
  page: PageConnection,
): Promise<WidgetData> {
  const { endpoints, param, header } = pageRequest(page);
  const response = await endpoints.widget.$get({
    param,
    // The address without query or fragment, so tracking parameters never stick.
    query: { url: location.origin + location.pathname, title: document.title },
    header,
  });
  if (response.status !== 200) {
    throw new Error(`Fox Renard: the Widget data answered ${response.status}.`);
  }
  return response.json();
}

/** Sets the browser's Reaction on the Page, or removes it with `null`. */
export async function putReaction(
  page: PageConnection,
  optionId: string | null,
) {
  const { endpoints, param, header } = pageRequest(page);
  const response = await endpoints.reaction.$put({
    param,
    header,
    json: { optionId },
  });
  if (response.status !== 200) {
    throw new Error(`Fox Renard: reacting answered ${response.status}.`);
  }
  const reacted = await response.json();
  keepBrowserToken(page.siteId, reacted.browserToken);
  return reacted;
}

/** The API refused a request, for the reason its error code gives. */
export class Refused extends Error {
  constructor(readonly code: string) {
    super(`Fox Renard: the API refused the request: ${code}.`);
  }
}

export async function postComment(
  page: PageConnection,
  comment: { displayName: string; text: string },
) {
  const { endpoints, param, header } = pageRequest(page);
  const response = await endpoints.comments.$post({
    param,
    header,
    json: comment,
  });
  if (response.status !== 201) {
    throw new Refused((await response.json()).error);
  }
  const posted = await response.json();
  keepBrowserToken(page.siteId, posted.browserToken);
  return posted;
}

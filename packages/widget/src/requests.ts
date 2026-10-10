import type { Client, WidgetData } from "@fox-renard/api/client";
import { keepBrowserToken, readBrowserToken } from "./browser-token";

/** The Page a Widget sits on, and the client that reaches its Site's API. */
export interface WidgetPage {
  client: Client;
  siteId: string;
  pageKey: string;
}

/** Sends the browser token, once the API has issued one for the Site. */
function authorization(siteId: string) {
  const browserToken = readBrowserToken(siteId);
  return browserToken ? { authorization: `Bearer ${browserToken}` } : {};
}

function pageOf({ client, siteId, pageKey }: WidgetPage) {
  return {
    endpoints: client.v1.sites[":siteId"].pages[":pageKey"],
    param: { siteId, pageKey },
    header: authorization(siteId),
  };
}

export async function fetchWidgetData(page: WidgetPage): Promise<WidgetData> {
  const { endpoints, param, header } = pageOf(page);
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
export async function putReaction(page: WidgetPage, optionId: string | null) {
  const { endpoints, param, header } = pageOf(page);
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

export async function postComment(
  page: WidgetPage,
  comment: { displayName: string; text: string },
) {
  const { endpoints, param, header } = pageOf(page);
  const response = await endpoints.comments.$post({
    param,
    header,
    json: comment,
  });
  if (response.status !== 201) {
    throw new Error(
      `Fox Renard: posting a Comment answered ${response.status}.`,
    );
  }
  const posted = await response.json();
  keepBrowserToken(page.siteId, posted.browserToken);
  return posted;
}

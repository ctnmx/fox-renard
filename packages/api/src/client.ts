import { hc, type InferResponseType } from "hono/client";
import type { App } from "./app";
import { sessionCookie } from "./session-cookie";

/** The console session's cookie, by the name a client sends it under. */
export const sessionCookieName = `__Host-${sessionCookie}`;

export {
  type CommentSort,
  type ListedStatus,
  listedStatuses,
  magicLinkParameter,
  maxPhotoBytes,
  maxPhotosPerComment,
  signInPath,
  type Vote,
} from "@fox-renard/core";

/**
 * The typed client the Widget, the console and the Hyvor import tool use to
 * call the HTTP API, with `fetch` by default.
 */
export function createClient(
  baseUrl: string,
  options: { fetch?: typeof fetch } = {},
) {
  return hc<App>(baseUrl, options);
}

export type Client = ReturnType<typeof createClient>;

type WidgetEndpoint =
  Client["v1"]["sites"][":siteId"]["pages"][":pageKey"]["widget"]["$get"];

/** What a Widget shows on a Page. */
export type WidgetData = InferResponseType<WidgetEndpoint, 200>;

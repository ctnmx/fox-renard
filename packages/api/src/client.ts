import { hc, type InferResponseType } from "hono/client";
import type { App } from "./app";

/** The typed client the Widget and the console use to call the HTTP API. */
export function createClient(baseUrl: string) {
  return hc<App>(baseUrl);
}

export type Client = ReturnType<typeof createClient>;

type WidgetEndpoint =
  Client["v1"]["sites"][":siteId"]["pages"][":pageKey"]["widget"]["$get"];

/** What a Widget shows on a Page. */
export type WidgetData = InferResponseType<WidgetEndpoint, 200>;

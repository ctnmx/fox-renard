import type { Client, WidgetData } from "@fox-renard/api/client";
import { useEffect, useState } from "preact/hooks";
import { t } from "./i18n";

async function fetchWidgetData(
  client: Client,
  siteId: string,
  pageKey: string,
): Promise<WidgetData> {
  const response = await client.v1.sites[":siteId"].pages[
    ":pageKey"
  ].widget.$get({
    param: { siteId, pageKey },
    // The address without query or fragment, so tracking parameters never stick.
    query: { url: location.origin + location.pathname, title: document.title },
    header: {},
  });
  if (response.status !== 200) {
    throw new Error(`Fox Renard: the Widget data answered ${response.status}.`);
  }
  return response.json();
}

export function Widget({
  client,
  siteId,
  pageKey,
}: {
  client: Client;
  siteId: string;
  pageKey: string;
}) {
  const [data, setData] = useState<WidgetData>();

  useEffect(() => {
    fetchWidgetData(client, siteId, pageKey).then(setData, console.error);
  }, [client, siteId, pageKey]);

  if (!data) return null;
  const { reactionSet } = data;

  return (
    <div class="widget">
      <fieldset class="reaction-set">
        <legend class="prompt">{reactionSet.prompt}</legend>
        <ul class="options">
          {reactionSet.options.map((option) => (
            <li key={option.id}>
              <button class="option" type="button">
                <span class="picto" aria-hidden="true">
                  {option.picto.emoji}
                </span>
                <span class="label">{option.label}</span>
                <span class="count">{option.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      <a
        class="powered-by"
        href="https://foxrenard.com"
        target="_blank"
        rel="noopener"
      >
        {t("poweredBy")}
      </a>
    </div>
  );
}

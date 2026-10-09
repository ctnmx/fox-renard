import type { Client, WidgetData } from "@fox-renard/api/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { keepBrowserToken, readBrowserToken } from "./browser-token";
import { t } from "./i18n";

/** Sends the browser token, once the API has issued one for the Site. */
function authorization(siteId: string) {
  const browserToken = readBrowserToken(siteId);
  return browserToken ? { authorization: `Bearer ${browserToken}` } : {};
}

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
    header: authorization(siteId),
  });
  if (response.status !== 200) {
    throw new Error(`Fox Renard: the Widget data answered ${response.status}.`);
  }
  return response.json();
}

/** Sets the browser's Reaction on the Page, or removes it with `null`. */
async function putReaction(
  client: Client,
  siteId: string,
  pageKey: string,
  optionId: string | null,
) {
  const response = await client.v1.sites[":siteId"].pages[
    ":pageKey"
  ].reaction.$put({
    param: { siteId, pageKey },
    header: authorization(siteId),
    json: { optionId },
  });
  if (response.status !== 200) {
    throw new Error(`Fox Renard: reacting answered ${response.status}.`);
  }
  const reacted = await response.json();
  keepBrowserToken(siteId, reacted.browserToken);
  return reacted;
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
  // One request at a time, so a double tap cannot issue two browser tokens.
  const reacting = useRef(false);

  useEffect(() => {
    fetchWidgetData(client, siteId, pageKey).then(setData, console.error);
  }, [client, siteId, pageKey]);

  if (!data) return null;
  const { reactionSet, reaction } = data;

  async function choose(optionId: string) {
    if (reacting.current) return;
    reacting.current = true;
    try {
      // Tapping the option the Visitor holds removes their Reaction.
      const { reactionSet, reaction } = await putReaction(
        client,
        siteId,
        pageKey,
        optionId === data?.reaction?.optionId ? null : optionId,
      );
      setData((data) => data && { ...data, reactionSet, reaction });
    } catch (error) {
      console.error(error);
    } finally {
      reacting.current = false;
    }
  }

  return (
    <div class="widget">
      <fieldset class="reaction-set">
        <legend class="prompt">{reactionSet.prompt}</legend>
        <ul class="options">
          {reactionSet.options.map((option) => (
            <li key={option.id}>
              <button
                class="option"
                type="button"
                aria-pressed={option.id === reaction?.optionId}
                onClick={() => choose(option.id)}
              >
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

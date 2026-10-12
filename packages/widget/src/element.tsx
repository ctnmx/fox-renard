import type { Client } from "@fox-renard/api/client";
import { render } from "preact";
import { takeMagicLinkToken } from "./magic-link";
import { Widget } from "./Widget";
import styles from "./widget.css";

/** How close to the viewport the Widget gets before it loads. */
const nearViewport = "600px 0px";

export function defineWidgetElement(client: Client): void {
  // The script may be included twice on a page.
  if (customElements.get("fox-renard-widget")) return;

  customElements.define(
    "fox-renard-widget",
    class extends HTMLElement {
      #observer: IntersectionObserver | undefined;

      connectedCallback() {
        const siteId = this.getAttribute("site-id");
        const pageKey = this.getAttribute("page-key");
        if (!siteId || !pageKey) {
          console.error("Fox Renard: site-id and page-key are required.");
          return;
        }

        // Opened from a magic link, the Widget loads at once and comes into view.
        const magicLinkToken = takeMagicLinkToken();
        if (magicLinkToken !== null) {
          this.#render(siteId, pageKey, magicLinkToken);
          this.scrollIntoView({ block: "start" });
          return;
        }

        // Nothing loads until the Visitor nears the Widget, so the Site stays fast.
        this.#observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            this.#observer?.disconnect();
            this.#render(siteId, pageKey, null);
          },
          { rootMargin: nearViewport },
        );
        this.#observer.observe(this);
      }

      disconnectedCallback() {
        this.#observer?.disconnect();
        if (this.shadowRoot) render(null, this.shadowRoot);
      }

      #render(siteId: string, pageKey: string, magicLinkToken: string | null) {
        // Shadow DOM keeps the Site's CSS out of the Widget.
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        render(
          <>
            <style>{styles}</style>
            <Widget
              client={client}
              siteId={siteId}
              pageKey={pageKey}
              magicLinkToken={magicLinkToken}
            />
          </>,
          root,
        );
      }
    },
  );
}

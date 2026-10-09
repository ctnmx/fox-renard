import { createClient } from "@fox-renard/api/client";
import { defineWidgetElement } from "./element";

// The API is served from the same origin as this script.
const script = document.currentScript;
if (!(script instanceof HTMLScriptElement)) {
  throw new Error("Fox Renard: load widget.js with a classic <script> tag.");
}

defineWidgetElement(createClient(new URL(script.src).origin));

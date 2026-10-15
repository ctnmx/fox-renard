// Gathers what the Worker serves without running into dist/: the Widget
// script and the console's single-page app, each built beforehand.
import { cp, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const builtFile = (specifier) => fileURLToPath(import.meta.resolve(specifier));
const assets = fileURLToPath(new URL("../dist/", import.meta.url));

await rm(assets, { recursive: true, force: true });
await cp(dirname(builtFile("@fox-renard/console/index.html")), assets, {
  recursive: true,
});
await cp(builtFile("@fox-renard/widget/widget.js"), `${assets}widget.js`);

// Captures the Widget on the demo route sheet:
// pnpm --filter @fox-renard/demo screenshot [file.png]
import { chromium } from "@playwright/test";
import { siteOrigin } from "./addresses";
import { startDemo } from "./demo";

const file = process.argv[2] ?? "test-results/widget.png";

await startDemo();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(siteOrigin);
  // The Widget's own element: the hostile CSS hides its `.w-embed` wrapper.
  const widget = page.locator("fox-renard-widget");
  await widget.scrollIntoViewIfNeeded();
  await widget.locator(".widget").waitFor();
  await widget.screenshot({ path: file });
  console.log(`Widget captured in ${file}`);
} finally {
  await browser.close();
}
// The in-memory database would keep the process alive.
process.exit(0);

// The route sheet alone, embedding the Widget from a deployment of Fox Renard:
// FOX_RENARD_API_ORIGIN=https://… pnpm --filter @fox-renard/demo route-sheet
import { siteOrigin } from "./addresses";
import { serveRouteSheet } from "./route-sheet";

const { FOX_RENARD_API_ORIGIN } = process.env;
if (!FOX_RENARD_API_ORIGIN) {
  console.error("FOX_RENARD_API_ORIGIN is required: the origin of widget.js.");
  process.exit(1);
}

serveRouteSheet(FOX_RENARD_API_ORIGIN);
console.log(
  `Route sheet on ${siteOrigin}, Widget from ${FOX_RENARD_API_ORIGIN}`,
);

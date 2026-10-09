// The local demo, which Seam 2 tests run against: pnpm --filter @fox-renard/demo start
import { apiOrigin, siteOrigin } from "./addresses";
import { startDemo } from "./demo";

await startDemo();
console.log(`Route sheet on ${siteOrigin}, API and Widget on ${apiOrigin}`);

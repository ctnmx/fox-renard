// Points a deployment's Hyperdrive binding at its database:
//   DATABASE_URL=… node scripts/hyperdrive.mjs bind <config name> <production|preview>
// creates or updates the Hyperdrive config named <config name>, then writes its
// id into wrangler.jsonc for that deployment. A closed pull request's config goes:
//   node scripts/hyperdrive.mjs delete <config name>
// Both need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
// https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/
import { readFileSync, writeFileSync } from "node:fs";

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABASE_URL } =
  process.env;
const [command, name, deployment] = process.argv.slice(2);

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.");
  process.exit(1);
}

const configs = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/hyperdrive/configs`;

/** Calls Cloudflare's API and returns its result, or throws with its errors. */
async function cloudflare(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: body && JSON.stringify(body),
  });
  const { success, errors, result } = await response.json();
  if (!success) {
    throw new Error(
      `Cloudflare refused ${method} ${new URL(url).pathname}: ${JSON.stringify(errors)}`,
    );
  }
  return result;
}

async function find(configName) {
  // The free plan allows 10 configs, so the first page holds them all.
  const all = await cloudflare("GET", configs);
  return all.find((config) => config.name === configName);
}

/** What Hyperdrive connects to, from a connection string such as Neon's. */
function originOf(connectionString) {
  const url = new URL(connectionString);
  return {
    scheme: "postgres",
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

async function bind() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const config = {
    name,
    origin: originOf(DATABASE_URL),
    // A Visitor sees their Reaction counted on the next load, not a cached count.
    caching: { disabled: true },
  };
  const existing = await find(name);
  const { id } = existing
    ? await cloudflare("PUT", `${configs}/${existing.id}`, config)
    : await cloudflare("POST", configs, config);

  const file = new URL("../wrangler.jsonc", import.meta.url);
  const placeholder = `"${deployment}-hyperdrive-id"`;
  const wrangler = readFileSync(file, "utf8");
  if (!wrangler.includes(placeholder)) {
    throw new Error(`wrangler.jsonc has no ${placeholder} to replace.`);
  }
  writeFileSync(file, wrangler.replace(placeholder, `"${id}"`));
  console.log(`The ${deployment} binds HYPERDRIVE to ${name} (${id}).`);
}

async function remove() {
  const existing = await find(name);
  if (!existing) {
    console.log(`No Hyperdrive config is named ${name}.`);
    return;
  }
  await cloudflare("DELETE", `${configs}/${existing.id}`);
  console.log(`Deleted the Hyperdrive config ${name}.`);
}

if (
  command === "bind" &&
  name &&
  ["production", "preview"].includes(deployment)
) {
  await bind();
} else if (command === "delete" && name) {
  await remove();
} else {
  console.error(
    "Usage: node scripts/hyperdrive.mjs bind <config name> <production|preview>\n" +
      "       node scripts/hyperdrive.mjs delete <config name>",
  );
  process.exit(1);
}

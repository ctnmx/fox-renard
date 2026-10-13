import { defineConfig } from "drizzle-kit";
import { withoutChannelBinding } from "./src/postgres";

const { DATABASE_URL } = process.env;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: DATABASE_URL ? withoutChannelBinding(DATABASE_URL) : "",
  },
});

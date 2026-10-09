import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Every row belongs to an Organization or to one of its Sites.

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const allowedDomains = pgTable(
  "allowed_domains",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.domain] })],
);

export const reactionSets = pgTable("reaction_sets", {
  siteId: uuid("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
});

export const reactionOptions = pgTable("reaction_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => reactionSets.siteId, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  pictoEmoji: text("picto_emoji").notNull(),
  label: text("label").notNull(),
});

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.siteId, table.key)],
);

export const sitesRelations = relations(sites, ({ many, one }) => ({
  allowedDomains: many(allowedDomains),
  reactionSet: one(reactionSets),
}));

export const allowedDomainsRelations = relations(allowedDomains, ({ one }) => ({
  site: one(sites, { fields: [allowedDomains.siteId], references: [sites.id] }),
}));

export const reactionSetsRelations = relations(
  reactionSets,
  ({ many, one }) => ({
    site: one(sites, { fields: [reactionSets.siteId], references: [sites.id] }),
    options: many(reactionOptions),
  }),
);

export const reactionOptionsRelations = relations(
  reactionOptions,
  ({ one }) => ({
    reactionSet: one(reactionSets, {
      fields: [reactionOptions.siteId],
      references: [reactionSets.siteId],
    }),
  }),
);

import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
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

/** A Visitor as one Site knows them: by their browser's token for that Site (ADR-0005). */
export const visitors = pgTable(
  "visitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** The SHA-256 of the browser token, which is never stored itself. */
    tokenHash: text("token_hash").notNull(),
    /** The Commenter this browser posts as, once it has posted. */
    commenterId: uuid("commenter_id").references(() => commenters.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.siteId, table.tokenHash)],
);

export const reactions = pgTable(
  "reactions",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => reactionOptions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  // One Reaction per Visitor and Page.
  (table) => [primaryKey({ columns: [table.pageId, table.visitorId] })],
);

/** A Visitor who posted on a Site under a display name, on that Site only (ADR-0005). */
export const commenters = pgTable("commenters", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    commenterId: uuid("commenter_id")
      .notNull()
      .references(() => commenters.id, { onDelete: "cascade" }),
    /**
     * The top-level Comment a Reply sits under, or null for a top-level
     * Comment. A Comment with Replies leaves a placeholder rather than being
     * deleted, so deleting its row fails.
     */
    topLevelCommentId: uuid("top_level_comment_id").references(
      (): AnyPgColumn => comments.id,
    ),
    /** Plain text, as its Commenter wrote it. */
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.pageId, table.createdAt)],
);

/** A Visitor's one Vote on a Comment or a Reply. */
export const votes = pgTable(
  "votes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["up", "down"] }).notNull(),
    createdAt: createdAt(),
  },
  // One Vote per Visitor and Comment.
  (table) => [primaryKey({ columns: [table.commentId, table.visitorId] })],
);

/** What abuse limits remember of recent Reactions and Votes, for 24 hours at most (ADR-0006). */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** Each action counts against limits of its own. */
    action: text("action", { enum: ["reaction", "vote"] }).notNull(),
    /** A keyed hash of the client's network, never its IP address. */
    fingerprint: text("fingerprint").notNull(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index().on(table.siteId, table.fingerprint),
    index().on(table.visitorId),
    index().on(table.at),
  ],
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

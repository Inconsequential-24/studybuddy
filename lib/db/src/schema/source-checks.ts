import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tutorSourceChecks = pgTable("tutor_source_checks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  fileName: text("file_name").notNull(),
  expectedSize: integer("expected_size").notNull(),
  objectPath: text("object_path"),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("uploading"),
  stage: text("stage"),
  report: jsonb("report"),
  failure: text("failure"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("tutor_source_checks_owner_created").on(table.ownerId, table.createdAt),
  index("tutor_source_checks_expires").on(table.expiresAt),
]);

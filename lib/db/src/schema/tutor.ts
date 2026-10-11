import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, jsonb, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

export const tutorProfiles = pgTable("tutor_profiles", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
});
export const tutorClassrooms = pgTable("tutor_classrooms", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").notNull(),
  sourceMap: jsonb("source_map").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tutorUploads = pgTable("tutor_uploads", {
  path: text("path").primaryKey(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").notNull(),
});
export const tutorAttempts = pgTable("tutor_attempts", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull().references(() => tutorClassrooms.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tutorExams = pgTable("tutor_exams", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull().references(() => tutorClassrooms.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
});
export const insertTutorProfileSchema = createInsertSchema(tutorProfiles);

export const tutorPageJobs = pgTable("tutor_page_jobs", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull().references(() => tutorClassrooms.id, { onDelete: "cascade" }),
  documentId: text("document_id").notNull(),
  localPage: integer("local_page").notNull(),
  page: integer("page").notNull(),
  status: text("status").notNull().default("pending"),
  stage: text("stage"),
  attempts: integer("attempts").notNull().default(0),
  totalAttempts: integer("total_attempts").notNull().default(0),
  failure: jsonb("failure"),
  result: jsonb("result"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tutor_page_jobs_classroom_page").on(table.classroomId, table.page),
  index("tutor_page_jobs_status_due").on(table.status, table.nextAttemptAt),
]);
export const insertTutorClassroomSchema = createInsertSchema(tutorClassrooms);
export type TutorClassroom = typeof tutorClassrooms.$inferSelect;

export const insertTutorPageJobSchema = createInsertSchema(tutorPageJobs);

export type TutorPageJob = typeof tutorPageJobs.$inferSelect;

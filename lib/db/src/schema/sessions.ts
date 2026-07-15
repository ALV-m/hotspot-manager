import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { packagesTable } from "./packages";

export const sessionStatusEnum = pgEnum("session_status", ["pending", "paid", "expired"]);

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  packageId: integer("package_id").notNull().references(() => packagesTable.id),
  status: sessionStatusEnum("status").notNull().default("pending"),
  paymentReference: text("payment_reference"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true, status: true, expiresAt: true, paymentReference: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;

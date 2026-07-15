import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const routerTable = pgTable("router", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("MikroTik"),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(8728),
  username: text("username").notNull().default("admin"),
  password: text("password").notNull().default(""),
  hotspotServer: text("hotspot_server").notNull().default("hotspot1"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRouterSchema = createInsertSchema(routerTable).omit({ id: true, createdAt: true });
export type InsertRouter = z.infer<typeof insertRouterSchema>;
export type RouterConfig = typeof routerTable.$inferSelect;

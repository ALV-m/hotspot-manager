import { Router } from "express";
import { db } from "@workspace/db";
import { routerTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as mikrotik from "../lib/mikrotik";

const router = Router();

router.get("/router", async (_req, res) => {
  const [r] = await db.select().from(routerTable).limit(1);
  if (!r) return res.json(null);
  res.json({
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    username: r.username,
    password: r.password,
    hotspotServer: r.hotspotServer,
    enabled: r.enabled,
  });
});

router.put("/router", async (req, res) => {
  const { name, host, port, username, password, hotspotServer } = req.body;
  const [existing] = await db.select().from(routerTable).limit(1);

  if (!existing) {
    await db.insert(routerTable).values({
      name: name || "MikroTik",
      host: host || "",
      port: port || 8728,
      username: username || "admin",
      password: password || "",
      hotspotServer: hotspotServer || "hotspot1",
    });
  } else {
    await db.update(routerTable).set({
      name: name ?? existing.name,
      host: host ?? existing.host,
      port: port ?? existing.port,
      username: username ?? existing.username,
      password: password ?? existing.password,
      hotspotServer: hotspotServer ?? existing.hotspotServer,
    }).where(eq(routerTable.id, existing.id));
  }

  mikrotik.disconnectRouter();
  res.json({ ok: true });
});

router.post("/router/test", async (_req, res) => {
  try {
    await mikrotik.connectRouter();
    const info = await mikrotik.getRouterInfo();
    res.json({ ok: true, info });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

router.get("/router/active", async (_req, res) => {
  try {
    const users = await mikrotik.getActiveUsers();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/router/info", async (_req, res) => {
  try {
    const info = await mikrotik.getRouterInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

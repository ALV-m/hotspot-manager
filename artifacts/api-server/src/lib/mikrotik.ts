import { RouterOSAPI } from "node-routeros";
import { db } from "@workspace/db";
import { routerTable } from "@workspace/db";
import { eq } from "drizzle-orm";

let connection: RouterOSAPI | null = null;

async function getRouterConfig() {
  const [router] = await db.select().from(routerTable).where(eq(routerTable.enabled, true)).limit(1);
  return router;
}

export async function connectRouter() {
  const config = await getRouterConfig();
  if (!config || !config.host) throw new Error("No router configured");

  try {
    const client = new RouterOSAPI({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password || "",
    });
    await client.connect();
    connection = client;
    return client;
  } catch (err: any) {
    connection = null;
    throw new Error("Router connection failed: " + err.message);
  }
}

async function getConnection() {
  if (connection) return connection;
  return await connectRouter();
}

export async function disconnectRouter() {
  if (connection) {
    try { await connection.close(); } catch {}
    connection = null;
  }
}

export async function addHotspotUser(username: string, password: string, profile?: string) {
  const client = await getConnection();
  const config = await getRouterConfig();
  await client.write("/ip/hotspot/user/add", [
    "=name=" + username,
    "=password=" + password,
    "=profile=" + (profile || "default"),
    "=server=" + (config?.hotspotServer || "hotspot1"),
  ]);
  return true;
}

export async function removeHotspotUser(username: string) {
  const client = await getConnection();
  const users = await client.write("/ip/hotspot/user/print", ["?name=" + username]);
  if (users.length > 0) {
    await client.write("/ip/hotspot/user/remove", ["=.id=" + (users[0] as any)[".id"]]);
  }
  return true;
}

export async function getActiveUsers() {
  const client = await getConnection();
  return await client.write("/ip/hotspot/active/print");
}

export async function getAllHotspotUsers() {
  const client = await getConnection();
  return await client.write("/ip/hotspot/user/print");
}

export async function getRouterInfo() {
  const client = await getConnection();
  const identity = await client.write("/system/identity/print");
  const resource = await client.write("/system/resource/print");
  return {
    name: (identity[0] as any)?.name || "Unknown",
    cpu: (resource[0] as any)?.["cpu-load"] || 0,
    memory: (resource[0] as any)?.["total-memory"] || 0,
    uptime: (resource[0] as any)?.uptime || "Unknown",
  };
}

export async function createHotspotUserProfile(name: string, speedLimit: string) {
  const client = await getConnection();
  await client.write("/ip/hotspot/user/profile/add", [
    "=name=" + name,
    "=rate-limit=" + speedLimit,
  ]);
  return true;
}

export async function autoLoginByMac(username: string, macAddress: string, ip?: string) {
  const client = await getConnection();
  const config = await getRouterConfig();
  try {
    await client.write("/ip/hotspot/active/add", [
      "=user=" + username,
      "=mac-address=" + macAddress,
      "=ip-address=" + (ip || "0.0.0.0"),
      "=server=" + (config?.hotspotServer || "hotspot1"),
    ]);
    return true;
  } catch (err: any) {
    console.error("Auto-login error:", err.message);
    return false;
  }
}

import { Router } from "express";
import { db } from "@workspace/db";
import { packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePackageBody, UpdatePackageBody } from "@workspace/api-zod";

const router = Router();

router.get("/packages", async (req, res) => {
  const packages = await db.select().from(packagesTable).orderBy(packagesTable.price);
  return res.json(packages.map(formatPackage));
});

router.post("/packages", async (req, res) => {
  const parsed = CreatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error });
  }
  const [pkg] = await db.insert(packagesTable).values({
    name: parsed.data.name,
    durationHours: parsed.data.durationHours,
    dataLimitMb: parsed.data.dataLimitMb,
    price: String(parsed.data.price),
    description: parsed.data.description ?? null,
    isActive: parsed.data.isActive ?? true,
  }).returning();
  return res.status(201).json(formatPackage(pkg));
});

router.get("/packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json(formatPackage(pkg));
});

router.put("/packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error });
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.durationHours !== undefined) updateData.durationHours = parsed.data.durationHours;
  if (parsed.data.dataLimitMb !== undefined) updateData.dataLimitMb = parsed.data.dataLimitMb;
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  const [pkg] = await db.update(packagesTable).set(updateData).where(eq(packagesTable.id, id)).returning();
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json(formatPackage(pkg));
});

router.delete("/packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(packagesTable).where(eq(packagesTable.id, id));
  return res.status(204).end();
});

function formatPackage(pkg: typeof packagesTable.$inferSelect) {
  return {
    id: pkg.id,
    name: pkg.name,
    durationHours: pkg.durationHours,
    dataLimitMb: pkg.dataLimitMb,
    price: parseFloat(pkg.price),
    description: pkg.description,
    isActive: pkg.isActive,
    createdAt: pkg.createdAt.toISOString(),
  };
}

export default router;

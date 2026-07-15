import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, packagesTable } from "@workspace/db";
import { eq, sql, and, gt, isNull, or } from "drizzle-orm";
import { CreateSessionBody } from "@workspace/api-zod";

const router = Router();

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.length === 9) return "254" + digits;
  return digits;
}

router.get("/sessions/stats", async (req, res) => {
  const sessions = await db
    .select({ status: sessionsTable.status, packageId: sessionsTable.packageId })
    .from(sessionsTable);

  const packages = await db.select().from(packagesTable);
  const pkgMap = new Map(packages.map((p) => [p.id, parseFloat(p.price)]));

  let paid = 0, pending = 0, expired = 0, revenue = 0;
  for (const s of sessions) {
    if (s.status === "paid") { paid++; revenue += pkgMap.get(s.packageId) ?? 0; }
    else if (s.status === "pending") pending++;
    else if (s.status === "expired") expired++;
  }

  return res.json({ total: sessions.length, paid, pending, expired, revenue });
});

router.get("/sessions/paid-ips", async (req, res) => {
  const now = new Date();
  const rows = await db
    .select({
      id: sessionsTable.id,
      phone: sessionsTable.phone,
      ipAddress: sessionsTable.ipAddress,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.status, "paid"), gt(sessionsTable.expiresAt, now)));

  return res.json(
    rows
      .filter((r) => r.ipAddress)
      .map((r) => ({
        sessionId: r.id,
        ipAddress: r.ipAddress!,
        phone: r.phone,
        expiresAt: r.expiresAt?.toISOString() ?? "",
      }))
  );
});

// Phone login — claims one unoccupied paid session slot for the caller's IP
router.post("/sessions/phone-login", async (req, res) => {
  const { phone, ipAddress } = req.body ?? {};
  if (!phone || !ipAddress) {
    return res.status(400).json({ error: "phone and ipAddress required" });
  }

  const normalizedPhone = normalizePhone(phone);
  const now = new Date();

  // Find an active paid session for this phone with no IP yet (unoccupied slot)
  const [slot] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.status, "paid"),
        gt(sessionsTable.expiresAt, now),
        or(isNull(sessionsTable.ipAddress), eq(sessionsTable.ipAddress, "")),
        or(
          eq(sessionsTable.phone, normalizedPhone),
          eq(sessionsTable.phone, phone)
        )
      )
    )
    .limit(1);

  if (!slot) {
    return res.status(404).json({ error: "No active plan found for this phone number" });
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({ ipAddress })
    .where(eq(sessionsTable.id, slot.id))
    .returning();

  const [row] = await db
    .select({
      id: sessionsTable.id,
      phone: sessionsTable.phone,
      packageId: sessionsTable.packageId,
      status: sessionsTable.status,
      paymentReference: sessionsTable.paymentReference,
      ipAddress: sessionsTable.ipAddress,
      expiresAt: sessionsTable.expiresAt,
      createdAt: sessionsTable.createdAt,
      packageName: packagesTable.name,
      packagePrice: packagesTable.price,
    })
    .from(sessionsTable)
    .leftJoin(packagesTable, eq(sessionsTable.packageId, packagesTable.id))
    .where(eq(sessionsTable.id, updated.id));

  req.log.info({ sessionId: updated.id, phone: normalizedPhone, ipAddress }, "Phone login successful");
  return res.json(formatSession(row!));
});

router.get("/sessions", async (req, res) => {
  const rows = await db
    .select({
      id: sessionsTable.id,
      phone: sessionsTable.phone,
      packageId: sessionsTable.packageId,
      status: sessionsTable.status,
      paymentReference: sessionsTable.paymentReference,
      ipAddress: sessionsTable.ipAddress,
      expiresAt: sessionsTable.expiresAt,
      createdAt: sessionsTable.createdAt,
      packageName: packagesTable.name,
      packagePrice: packagesTable.price,
    })
    .from(sessionsTable)
    .leftJoin(packagesTable, eq(sessionsTable.packageId, packagesTable.id))
    .orderBy(sql`${sessionsTable.createdAt} DESC`);

  return res.json(rows.map(formatSession));
});

router.post("/sessions", async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error });
  }

  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, parsed.data.packageId));
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  const adminCreated = parsed.data.adminCreated === true;
  const numDevices = adminCreated ? Math.max(1, Math.min(20, parsed.data.numDevices ?? 1)) : 1;
  const expiresAt = adminCreated
    ? new Date(Date.now() + pkg.durationHours * 3600 * 1000)
    : null;

  // If admin creates multiple device slots, insert them all
  if (adminCreated && numDevices > 1) {
    const rows = await db
      .insert(sessionsTable)
      .values(
        Array.from({ length: numDevices }, () => ({
          phone: normalizePhone(parsed.data.phone),
          packageId: parsed.data.packageId,
          ipAddress: null as string | null,
          status: "paid" as const,
          expiresAt,
          paymentReference: `ADMIN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }))
      )
      .returning();

    return res.status(201).json({
      id: rows[0].id,
      phone: rows[0].phone,
      packageId: rows[0].packageId,
      packageName: pkg.name,
      packagePrice: parseFloat(pkg.price),
      status: rows[0].status,
      paymentReference: rows[0].paymentReference,
      ipAddress: null,
      expiresAt: expiresAt?.toISOString() ?? null,
      createdAt: rows[0].createdAt.toISOString(),
      slotsCreated: numDevices,
    });
  }

  const [session] = await db.insert(sessionsTable).values({
    phone: adminCreated ? normalizePhone(parsed.data.phone) : parsed.data.phone,
    packageId: parsed.data.packageId,
    ipAddress: parsed.data.ipAddress ?? null,
    status: adminCreated ? "paid" : "pending",
    expiresAt,
    paymentReference: adminCreated ? `ADMIN-${Date.now()}` : null,
  }).returning();

  return res.status(201).json({
    ...formatSessionBasic(session),
    packageName: pkg.name,
    packagePrice: parseFloat(pkg.price),
  });
});

router.get("/sessions/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [row] = await db
    .select({
      id: sessionsTable.id,
      phone: sessionsTable.phone,
      packageId: sessionsTable.packageId,
      status: sessionsTable.status,
      paymentReference: sessionsTable.paymentReference,
      ipAddress: sessionsTable.ipAddress,
      expiresAt: sessionsTable.expiresAt,
      createdAt: sessionsTable.createdAt,
      packageName: packagesTable.name,
      packagePrice: packagesTable.price,
    })
    .from(sessionsTable)
    .leftJoin(packagesTable, eq(sessionsTable.packageId, packagesTable.id))
    .where(eq(sessionsTable.id, id));

  if (!row) return res.status(404).json({ error: "Session not found" });
  return res.json(formatSession(row));
});

router.post("/sessions/:id/disconnect", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [session] = await db
    .update(sessionsTable)
    .set({ status: "expired", expiresAt: new Date() })
    .where(eq(sessionsTable.id, id))
    .returning();

  if (!session) return res.status(404).json({ error: "Session not found" });

  req.log.info({ sessionId: id }, "Session disconnected by admin");

  const [row] = await db
    .select({
      id: sessionsTable.id,
      phone: sessionsTable.phone,
      packageId: sessionsTable.packageId,
      status: sessionsTable.status,
      paymentReference: sessionsTable.paymentReference,
      ipAddress: sessionsTable.ipAddress,
      expiresAt: sessionsTable.expiresAt,
      createdAt: sessionsTable.createdAt,
      packageName: packagesTable.name,
      packagePrice: packagesTable.price,
    })
    .from(sessionsTable)
    .leftJoin(packagesTable, eq(sessionsTable.packageId, packagesTable.id))
    .where(eq(sessionsTable.id, id));

  return res.json(formatSession(row!));
});

type SessionRow = {
  id: number;
  phone: string;
  packageId: number;
  status: "pending" | "paid" | "expired";
  paymentReference: string | null;
  ipAddress: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  packageName: string | null;
  packagePrice: string | null;
};

function formatSession(row: SessionRow) {
  return {
    id: row.id,
    phone: row.phone,
    packageId: row.packageId,
    packageName: row.packageName ?? null,
    packagePrice: row.packagePrice ? parseFloat(row.packagePrice) : null,
    status: row.status,
    paymentReference: row.paymentReference,
    ipAddress: row.ipAddress,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatSessionBasic(session: typeof sessionsTable.$inferSelect) {
  return {
    id: session.id,
    phone: session.phone,
    packageId: session.packageId,
    status: session.status,
    paymentReference: session.paymentReference,
    ipAddress: session.ipAddress,
    expiresAt: session.expiresAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
  };
}

export default router;

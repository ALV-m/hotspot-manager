import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitiatePaymentBody } from "@workspace/api-zod";

const router = Router();

const PAYHERO_API_URL = "https://backend.payhero.co.ke/api/v2/payments?is_active=true";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

function getCallbackUrl(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}/api/payments/callback`;
  return `https://example.com/api/payments/callback`;
}

router.post("/payments/initiate", async (req, res) => {
  const parsed = InitiatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { sessionId, phone, amount } = parsed.data;

  const auth = process.env.PAYHERO_AUTH;
  const channelId = process.env.PAYHERO_CHANNEL_ID;

  if (!auth || !channelId) {
    return res.status(200).json({
      success: false,
      message: "Payment gateway not configured. Add PAYHERO_AUTH and PAYHERO_CHANNEL_ID secrets.",
      reference: null,
    });
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) return res.status(404).json({ error: "Session not found" });

  const normalizedPhone = normalizePhone(phone);
  const reference = `HPS-${sessionId}-${Date.now()}`;
  const callbackUrl = getCallbackUrl();

  req.log.info({ phone: normalizedPhone, amount, channelId, callbackUrl }, "Initiating PayHero STK push");

  try {
    const response = await fetch(PAYHERO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": auth,
      },
      body: JSON.stringify({
        amount: Math.round(amount),
        phone_number: normalizedPhone,
        channel_id: parseInt(channelId),
        provider: "m-pesa",
        external_reference: reference,
        customer_name: "WiFi Customer",
        callback_url: callbackUrl,
      }),
    });

    const data = await response.json() as Record<string, unknown>;
    req.log.info({ status: response.status, data }, "PayHero response");

    if (response.status === 201 || data.success === true || data.status === "QUEUED") {
      const ref = (data.reference as string) ?? (data.CheckoutRequestID as string) ?? reference;
      await db.update(sessionsTable)
        .set({ paymentReference: ref })
        .where(eq(sessionsTable.id, sessionId));
      return res.json({ success: true, message: "STK Push sent. Check your phone.", reference: ref });
    } else {
      req.log.error({ data }, "PayHero error response");
      const msg = (data.message as string) ?? (data.error as string) ?? "Failed to initiate payment";
      return res.json({ success: false, message: msg, reference: null });
    }
  } catch (err) {
    req.log.error({ err }, "PayHero request failed");
    return res.json({ success: false, message: "Payment service unavailable", reference: null });
  }
});

router.post("/payments/callback", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  req.log.info({ body }, "PayHero callback received");

  const status = body.status as string | undefined;
  const reference = (body.reference ?? body.external_reference ?? body.CheckoutRequestID) as string | undefined;

  if (reference && (status === "Success" || status === "SUCCESS" || status === "COMPLETE" || status === "success")) {
    const [session] = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.paymentReference, reference));

    if (session) {
      const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, session.packageId));
      const expiresAt = pkg
        ? new Date(Date.now() + pkg.durationHours * 3600 * 1000)
        : new Date(Date.now() + 3600 * 1000);

      await db.update(sessionsTable)
        .set({ status: "paid", expiresAt })
        .where(eq(sessionsTable.id, session.id));

      req.log.info({ sessionId: session.id, reference }, "Session marked as paid");
    }
  }

  return res.json({ status: "ok" });
});

router.get("/payments/status/:reference", async (req, res) => {
  const { reference } = req.params;

  const [session] = await db.select()
    .from(sessionsTable)
    .where(eq(sessionsTable.paymentReference, reference));

  if (!session) {
    return res.json({ status: "pending", sessionId: null });
  }

  if (session.status === "paid") {
    return res.json({ status: "paid", sessionId: session.id });
  }

  if (session.status === "expired") {
    return res.json({ status: "failed", sessionId: session.id });
  }

  return res.json({ status: "pending", sessionId: session.id });
});

export default router;

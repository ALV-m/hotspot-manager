import { Router } from "express";

const router = Router();

function getBaseUrl(): string {
  return process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_DOMAINS?.split(",")[0] || "";
}

function getCallbackUrl(): string {
  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    return url.replace(/\/$/, "") + "/api/payments/callback";
  }
  return "SET_BASE_URL_FIRST";
}

router.get("/config", (_req, res) => {
  res.json({
    callbackUrl: getCallbackUrl(),
    baseUrl: getBaseUrl(),
    payheroConfigured: !!(process.env.PAYHERO_AUTH && process.env.PAYHERO_CHANNEL_ID),
  });
});

export default router;

import { Router } from "express";

const router = Router();

// ── In-memory visitor store (survives process, not restarts) ──
// Key = IP address, Value = visitor record
interface Visitor {
  ipAddress: string;
  userAgent: string;
  deviceType: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

const visitors = new Map<string, Visitor>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes idle = gone

function parseUA(ua: string): Pick<Visitor, "deviceType" | "os" | "browser"> {
  const s = ua ?? "";

  // Device type
  let deviceType: Visitor["deviceType"] = "desktop";
  if (/iPad|Android(?!.*Mobile)/i.test(s)) deviceType = "tablet";
  else if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(s)) deviceType = "mobile";

  // OS
  let os = "Unknown";
  if (/Android/i.test(s)) {
    const m = s.match(/Android\s?([\d._]+)/i);
    os = m ? `Android ${m[1]}` : "Android";
  } else if (/iPhone|iPad|iPod/i.test(s)) {
    const m = s.match(/OS\s?([\d_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  } else if (/Windows NT/i.test(s)) {
    const v: Record<string, string> = { "10.0": "11/10", "6.3": "8.1", "6.2": "8", "6.1": "7" };
    const m = s.match(/Windows NT ([\d.]+)/i);
    os = m ? `Windows ${v[m[1]] ?? m[1]}` : "Windows";
  } else if (/Macintosh|Mac OS X/i.test(s)) {
    os = "macOS";
  } else if (/Linux/i.test(s)) {
    os = "Linux";
  } else if (/CrOS/i.test(s)) {
    os = "ChromeOS";
  }

  // Browser
  let browser = "Unknown";
  if (/Edg\//i.test(s))         browser = "Edge";
  else if (/OPR\//i.test(s))    browser = "Opera";
  else if (/Chrome/i.test(s))   browser = "Chrome";
  else if (/Firefox/i.test(s))  browser = "Firefox";
  else if (/Safari/i.test(s))   browser = "Safari";
  else if (/MSIE|Trident/i.test(s)) browser = "IE";

  return { deviceType, os, browser };
}

// POST /visitors/ping — called by portal on every load
router.post("/visitors/ping", (req, res) => {
  const ip = (req.body?.ipAddress as string) || req.ip || "unknown";
  const ua = (req.body?.userAgent as string) || req.headers["user-agent"] || "";

  const now = new Date().toISOString();
  const existing = visitors.get(ip);

  visitors.set(ip, {
    ipAddress: ip,
    userAgent: ua,
    ...parseUA(ua),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  });

  return res.json({ ok: true });
});

// GET /visitors — returns all visitors active within TTL
router.get("/visitors", (_req, res) => {
  const cutoff = Date.now() - TTL_MS;
  const active: Visitor[] = [];

  for (const [ip, v] of visitors) {
    if (new Date(v.lastSeenAt).getTime() < cutoff) {
      visitors.delete(ip);
    } else {
      active.push(v);
    }
  }

  // Most recently seen first
  active.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return res.json(active);
});

export default router;

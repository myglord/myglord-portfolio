/* ============ MYGLORD MUSS — SITE SERVER + ADMIN API ============ */
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* ---------- tiny .env loader ---------- */
const ENV = {};
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) ENV[m[1]] = m[2];
  }
}
const ADMIN_PASSWORD = ENV.ADMIN_PASSWORD || "changeme";
const CONTACT_TO = ENV.CONTACT_TO || "mussgraph@gmail.com";
const GMAIL_USER = ENV.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = ENV.GMAIL_APP_PASSWORD || "";

/* ---------- JSON file stores ---------- */
function load(name, fallback) {
  const p = path.join(DATA_DIR, name);
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function save(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2));
}

const DEFAULT_CONTENT = {
  heroSubtitle: "Designing websites that convert and captivate",
  stats: [
    { value: 24, decimals: 0, prefix: "", suffix: "K+", label: "SUBSCRIBERS" },
    { value: 87, decimals: 0, prefix: "", suffix: "", label: "CLIENTS SERVED" },
    { value: 140, decimals: 0, prefix: "", suffix: "+", label: "PROJECTS SHIPPED" },
    { value: 1.8, decimals: 1, prefix: "$", suffix: "M", label: "CLIENT REVENUE DRIVEN" },
  ],
  pillars: [
    { title: "HIGH-CONVERTING\nWEBSITES", desc: "Landing pages and full sites engineered around one goal — turning your visitors into paying customers." },
    { title: "BRAND &\nVISUAL IDENTITY", desc: "Distinctive design systems — typography, color, motion — that make your brand impossible to ignore." },
    { title: "CINEMATIC\nWEB EXPERIENCES", desc: "Scroll-driven, award-grade interactive experiences that make people stop, stare, and share." },
  ],
  projects: [
    { title: "NOVA FITNESS", pitch: "A membership site redesign that lifted sign-ups 63% in eight weeks." },
    { title: "KUDU COFFEE CO.", pitch: "An e-commerce storefront so smooth, cart abandonment dropped by a third." },
    { title: "ORBIT STUDIOS", pitch: "A cinematic agency portfolio that tripled inbound leads in one quarter." },
  ],
  finaleSub: "Let's build something people can't scroll past.",
};

if (!fs.existsSync(path.join(DATA_DIR, "content.json"))) save("content.json", DEFAULT_CONTENT);

/* ---------- mailer ---------- */
const smtpConfigured = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  : null;

async function sendMail(to, subject, text, replyTo) {
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };
  try {
    await transporter.sendMail({ from: `"Myglord Muss Portfolio" <${GMAIL_USER}>`, to, subject, text, replyTo });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/* ---------- activity log ---------- */
function logActivity(event, meta, req) {
  const activity = load("activity.json", []);
  activity.push({
    event,
    meta: meta || {},
    ua: (req.headers["user-agent"] || "").slice(0, 160),
    at: new Date().toISOString(),
  });
  if (activity.length > 5000) activity.splice(0, activity.length - 5000);
  save("activity.json", activity);
}

/* ---------- admin sessions ---------- */
const sessions = new Map(); // token -> expiry
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) return res.status(401).json({ error: "unauthorized" });
  next();
}

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: "200kb" }));

/* ----- public API ----- */
app.get("/api/content", (req, res) => res.json(load("content.json", DEFAULT_CONTENT)));

app.post("/api/track", (req, res) => {
  const { event, meta } = req.body || {};
  if (typeof event !== "string" || event.length > 60) return res.status(400).json({ error: "bad event" });
  logActivity(event, meta, req);
  res.json({ ok: true });
});

app.post("/api/subscribe", (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "invalid email" });
  const subs = load("subscribers.json", []);
  if (!subs.find((s) => s.email === email)) {
    subs.push({ email, at: new Date().toISOString() });
    save("subscribers.json", subs);
    logActivity("subscribe", { email }, req);
  }
  res.json({ ok: true });
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: "all fields required" });
  const msg = {
    name: String(name).slice(0, 120),
    email: String(email).slice(0, 160),
    message: String(message).slice(0, 4000),
    at: new Date().toISOString(),
  };
  const messages = load("messages.json", []);
  messages.push(msg);
  save("messages.json", messages);
  logActivity("contact_message", { name: msg.name, email: msg.email }, req);
  const mail = await sendMail(
    CONTACT_TO,
    `Portfolio contact from ${msg.name}`,
    `From: ${msg.name} <${msg.email}>\n\n${msg.message}`,
    msg.email
  );
  res.json({ ok: true, emailed: mail.sent });
});

/* ----- admin API ----- */
app.post("/api/admin/login", (req, res) => {
  if ((req.body || {}).password !== ADMIN_PASSWORD) {
    logActivity("admin_login_failed", {}, req);
    return res.status(401).json({ error: "wrong password" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + 12 * 3600 * 1000);
  logActivity("admin_login", {}, req);
  res.json({ token });
});

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  const activity = load("activity.json", []);
  const counts = {};
  for (const a of activity) counts[a.event] = (counts[a.event] || 0) + 1;
  res.json({
    counts,
    totals: {
      subscribers: load("subscribers.json", []).length,
      messages: load("messages.json", []).length,
      events: activity.length,
    },
    recent: activity.slice(-100).reverse(),
    smtpConfigured,
    contactTo: CONTACT_TO,
  });
});

app.get("/api/admin/subscribers", requireAdmin, (req, res) => res.json(load("subscribers.json", [])));

app.delete("/api/admin/subscribers/:email", requireAdmin, (req, res) => {
  const subs = load("subscribers.json", []).filter((s) => s.email !== req.params.email.toLowerCase());
  save("subscribers.json", subs);
  res.json({ ok: true });
});

app.get("/api/admin/messages", requireAdmin, (req, res) => res.json(load("messages.json", []).slice().reverse()));

app.post("/api/admin/broadcast", requireAdmin, async (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: "subject and body required" });
  const subs = load("subscribers.json", []);
  if (subs.length === 0) return res.json({ ok: true, sent: 0, failed: 0, note: "no subscribers" });
  if (!smtpConfigured) return res.status(400).json({ error: "Email is not configured yet — add GMAIL_USER and GMAIL_APP_PASSWORD to .env" });
  let sent = 0, failed = 0;
  for (const s of subs) {
    const r = await sendMail(s.email, subject, body);
    r.sent ? sent++ : failed++;
  }
  const broadcasts = load("broadcasts.json", []);
  broadcasts.push({ subject, body, sent, failed, at: new Date().toISOString() });
  save("broadcasts.json", broadcasts);
  logActivity("broadcast_sent", { subject, sent, failed }, req);
  res.json({ ok: true, sent, failed });
});

app.get("/api/admin/broadcasts", requireAdmin, (req, res) => res.json(load("broadcasts.json", []).slice().reverse()));

app.get("/api/admin/content", requireAdmin, (req, res) => res.json(load("content.json", DEFAULT_CONTENT)));

app.put("/api/admin/content", requireAdmin, (req, res) => {
  const c = req.body;
  if (!c || !Array.isArray(c.stats) || !Array.isArray(c.pillars) || !Array.isArray(c.projects)) {
    return res.status(400).json({ error: "malformed content" });
  }
  save("content.json", c);
  logActivity("content_updated", {}, req);
  res.json({ ok: true });
});

/* ----- static site ----- */
app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));
app.use(express.static(ROOT, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    // HTML/JS/CSS always fresh; heavy media can cache
    if (/\.(html|js|css|json)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
    else res.setHeader("Cache-Control", "public, max-age=86400");
  },
}));

const PORT = process.env.PORT || 4175;
app.listen(PORT, () => {
  console.log(`Myglord Muss portfolio running on http://localhost:${PORT}`);
  console.log(`Admin dashboard:                http://localhost:${PORT}/admin`);
  console.log(`SMTP configured: ${smtpConfigured ? "yes" : "NO — contact emails & broadcasts will be stored but not emailed"}`);
});

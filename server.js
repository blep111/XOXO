// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// In-memory simple cache for token validation (token -> { valid:bool, expiresAt, fetchedAt })
const tokenCache = new Map();

// Helper: validate token via Graph API /me?access_token=...
async function validateToken(token) {
  if (!token || token.length < 10) return { ok: false, error: "invalid_token" };

  const cached = tokenCache.get(token);
  const now = Date.now();
  if (cached && (cached.fetchedAt + 1000 * 60 * 5) > now) { // cache 5 minutes
    return { ok: cached.ok, data: cached.data, error: cached.error };
  }

  try {
    const resp = await fetch(`https://graph.facebook.com/me?access_token=${encodeURIComponent(token)}`);
    const json = await resp.json();
    if (json && json.id) {
      tokenCache.set(token, { ok: true, data: json, error: null, fetchedAt: now });
      return { ok: true, data: json };
    } else {
      tokenCache.set(token, { ok: false, data: json, error: json && json.error ? json.error : "unknown", fetchedAt: now });
      return { ok: false, error: json && json.error ? json.error : "unknown" };
    }
  } catch (err) {
    tokenCache.set(token, { ok: false, data: null, error: err.message || "network", fetchedAt: now });
    return { ok: false, error: err.message || "network" };
  }
}

// Helper: perform N posts for a token (sequentially), return success/fail counts and errors
async function shareWithToken(token, link, count, perRequestDelay = 120, maxRetries = 1) {
  let success = 0;
  let fail = 0;
  const errors = [];

  for (let i = 0; i < count; i++) {
    let attempt = 0;
    let ok = false;
    while (attempt <= maxRetries && !ok) {
      attempt++;
      try {
        const params = new URLSearchParams({
          link,
          access_token: token,
          published: "0"
        });
        const r = await fetch(`https://graph.facebook.com/v18.0/me/feed`, {
          method: "POST",
          body: params
        });
        const json = await r.json().catch(() => null);
        if (json && json.id) {
          success++;
          ok = true;
          // update token cache success
          tokenCache.set(token, { ...(tokenCache.get(token) || {}), ok: true, data: tokenCache.get(token)?.data || null, fetchedAt: Date.now() });
        } else {
          // treat as failure; capture error
          fail++;
          errors.push({ attempt: i + 1, response: json || { status: r.status } });
          // if retry allowed, continue loop
        }
      } catch (err) {
        fail++;
        errors.push({ attempt: i + 1, error: err.message || String(err) });
      }
    }

    // small delay between attempts for same token
    await new Promise(r => setTimeout(r, perRequestDelay));
  }

  return { success, fail, errors };
}

// POST /api/validate-token
// Body: { token }
app.post("/api/validate-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ ok: false, message: "missing token" });
  const v = await validateToken(token);
  return res.json(v);
});

// POST /api/share-batch
// Body: { tokens: [token1, token2...], link: string, total_shares: number, perRequestDelay?: number }
// Behavior: distribute total_shares across tokens evenly, run tokens in parallel (each token does its allocated shares sequentially)
app.post("/api/share-batch", async (req, res) => {
  try {
    const { tokens: rawTokens, link, total_shares, perRequestDelay = 120 } = req.body;
    if (!Array.isArray(rawTokens) || rawTokens.length === 0) return res.status(400).json({ status: false, message: "tokens required" });
    if (!link) return res.status(400).json({ status: false, message: "link required" });
    const total = parseInt(total_shares, 10);
    if (isNaN(total) || total <= 0) return res.status(400).json({ status: false, message: "total_shares must be > 0" });

    // Clean tokens
    const tokens = rawTokens.map(t => (typeof t === "string" ? t.trim() : "")).filter(t => t.length > 10);
    if (tokens.length === 0) return res.status(400).json({ status: false, message: "no valid tokens" });

    // Validate tokens in parallel (quickly)
    const validations = await Promise.all(tokens.map(t => validateToken(t)));
    const validTokens = tokens.filter((t, i) => validations[i].ok);
    const invalidInfo = tokens.map((t, i) => ({ tokenPreview: t.slice(0,8), ok: validations[i].ok, info: validations[i].error || validations[i].data }));

    if (validTokens.length === 0) {
      return res.json({ status: false, message: "no valid tokens", invalidInfo });
    }

    // Distribute shares evenly (first tokens get +1 if remainder)
    const base = Math.floor(total / validTokens.length);
    let rem = total % validTokens.length;
    const perToken = validTokens.map((_, i) => base + (i < rem ? 1 : 0));

    // Launch share tasks in parallel (each token does its allocated shares sequentially)
    const shareTasks = validTokens.map((token, i) => shareWithToken(token, link, perToken[i], perRequestDelay));

    const results = await Promise.all(shareTasks);

    // Build response summary
    let totalSuccess = 0, totalFail = 0;
    const perTokenResults = results.map((r, i) => {
      totalSuccess += r.success;
      totalFail += r.fail;
      return { tokenPreview: validTokens[i].slice(0,12), success: r.success, fail: r.fail, errors: r.errors.slice(0,5) };
    });

    return res.json({
      status: true,
      totalRequested: total,
      totalSuccess,
      totalFail,
      perTokenResults,
      invalidInfo
    });
  } catch (err) {
    console.error("share-batch error:", err);
    return res.status(500).json({ status: false, message: "server error", error: err.message || String(err) });
  }
});

// Serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`🎃 Server running at http://localhost:${PORT}`));

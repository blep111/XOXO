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

// Serve static UI
app.use(express.static(path.join(__dirname, "public")));

// POST /api/share-token-single
// Body: { token: string, link: string, count: number }
// Server uses the provided token to make `count` attempts to post `link` to /me/feed
app.post("/api/share-token-single", async (req, res) => {
  try {
    const { token, link, count } = req.body;
    if (!token || !link || !count) {
      return res.status(400).json({ status: false, message: "Missing token, link or count" });
    }

    const parsedCount = parseInt(count, 10);
    if (isNaN(parsedCount) || parsedCount <= 0) {
      return res.status(400).json({ status: false, message: "Invalid count" });
    }

    console.log(`[share] starting token (first 12 chars): ${token.slice(0,12)}..., attempts: ${parsedCount}`);

    let success = 0;
    let fail = 0;
    const errors = [];

    for (let i = 0; i < parsedCount; i++) {
      try {
        // POST form-encoded to Graph API
        const params = new URLSearchParams({
          link,
          access_token: token,
          published: "0"
        });

        const r = await fetch(`https://graph.facebook.com/v18.0/me/feed`, {
          method: "POST",
          body: params
        });

        // Try parse JSON response
        let json;
        try { json = await r.json(); } catch (e) { json = null; }

        if (json && json.id) {
          success++;
        } else {
          fail++;
          const errText = json && json.error ? `${json.error.type || ""} ${json.error.message || ""}` : `status:${r.status}`;
          errors.push({ attempt: i+1, err: errText });
          console.warn(`[share] attempt ${i+1} failed for token ${token.slice(0,8)}.. =>`, errText);
        }
      } catch (err) {
        fail++;
        const msg = err && err.message ? err.message : String(err);
        errors.push({ attempt: i+1, err: msg });
        console.error("[share] network error:", msg);
      }

      // small delay to avoid aggressive bursts - keep short for speed
      await new Promise((r) => setTimeout(r, 120));
    }

    return res.json({ status: true, success, fail, errors });
  } catch (err) {
    console.error("share-token-single endpoint error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
});

// Serve UI entry
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎃 Server running at http://localhost:${PORT}`);
});

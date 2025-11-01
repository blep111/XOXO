// server.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(bodyParser.json());

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// POST /api/share-token-single
// Body: { token: string, link: string, count: number }
// Uses Graph API v18.0 to post to /me/feed count times (sequentially for a given token)
app.post("/api/share-token-single", async (req, res) => {
  try {
    const { token, link, count } = req.body;
    if (!token || !link || !count) {
      return res.status(400).json({ status: false, message: "Missing token/link/count" });
    }

    const parsedCount = parseInt(count, 10);
    if (isNaN(parsedCount) || parsedCount <= 0) {
      return res.status(400).json({ status: false, message: "Invalid count" });
    }

    let success = 0;
    let fail = 0;

    // sequentially attempt 'count' shares for this token (so Graph token usage stays consistent)
    for (let i = 0; i < parsedCount; i++) {
      try {
        const params = new URLSearchParams({
          link,
          access_token: token,
          published: "0"
        });

        const response = await fetch(`https://graph.facebook.com/v18.0/me/feed?${params.toString()}`, {
          method: "POST"
        });

        const text = await response.text();

        if (text.includes('"id"')) {
          success++;
        } else {
          // treat any non-id response as a failure for that attempt
          fail++;
        }
      } catch (err) {
        console.error("Error during share attempt:", err && err.message ? err.message : err);
        fail++;
      }

      // short delay to avoid very aggressive burst
      await new Promise((r) => setTimeout(r, 120));
    }

    return res.json({ status: true, success, fail });
  } catch (err) {
    console.error("share-token-single error:", err && err.message ? err.message : err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
});

// Serve index
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎃 Server running at http://localhost:${PORT}`);
});

// server.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(bodyParser.json());

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static UI from /public
app.use(express.static(path.join(__dirname, "public")));

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// Robust token extraction from business.facebook.com
async function extractToken(cookie, ua) {
  try {
    const resp = await fetch("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        referer: "https://www.facebook.com/",
        cookie
      },
      // node-fetch v3 doesn't support timeout option in same way; handle externally if needed
    });
    const txt = await resp.text();
    const m =
      txt.match(/"access_token"\s*:\s*"([^"]+)"/) ||
      txt.match(/(EAAG\w+)/) ||
      txt.match(/(EAAI\w+)/);
    return m ? m[1] : null;
  } catch (err) {
    console.error("extractToken error:", err.message || err);
    return null;
  }
}

// POST /api/share-single
// Accepts: { cookie (string), link (string), count (number) }
// Shares 'count' times using that single cookie (sequentially)
app.post("/api/share-single", async (req, res) => {
  const { cookie, link, count } = req.body;
  if (!cookie || !link || !count) {
    return res.json({ status: false, message: "Missing cookie/link/count" });
  }

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extractToken(cookie, ua);

  if (!token) {
    return res.json({ status: false, message: "Token extraction failed for this cookie" });
  }

  let ok = 0;
  let bad = 0;

  for (let i = 0; i < count; i++) {
    try {
      // Use Graph API v18.0 post to /me/feed with published=0 (like your original)
      const params = new URLSearchParams({
        link,
        access_token: token,
        published: "0"
      });
      const graphRes = await fetch(`https://graph.facebook.com/v18.0/me/feed?${params.toString()}`, {
        method: "POST",
        headers: { "user-agent": ua, cookie }
      });

      const body = await graphRes.text();
      if (body.includes('"id"')) ok++;
      else {
        bad++;
        // stop early if facebook returns an error that isn't transient
        if (body.includes('"error"')) {
          console.warn("Facebook error for cookie:", body);
          // continue so we return counts; do not throw
        }
      }
    } catch (err) {
      bad++;
      console.error("share attempt error:", err.message || err);
    }

    // small delay to look more "human" and reduce rate-limit risk
    await new Promise((r) => setTimeout(r, 250));
  }

  res.json({ status: true, success: ok, fail: bad });
});

// Serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎃 Server running on http://localhost:${PORT}`);
});

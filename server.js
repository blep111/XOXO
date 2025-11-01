import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Middleware
app.use(bodyParser.json());

// ESM-safe dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ------------------------------------
// UA list
// ------------------------------------
const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// ------------------------------------
// Extract Token
// ------------------------------------
async function extractToken(cookie, ua) {
  try {
    const res = await fetch("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        "referer": "https://www.facebook.com/",
        "cookie": cookie
      }
    });
    const text = await res.text();
    const match = text.match(/(EAAG\w+)/);
    return match ? match[1] : null;
  } catch (err) {
    console.error("extractToken error:", err);
    return null;
  }
}

// ------------------------------------
// Routes
// ------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/share", async (req, res) => {
  const { cookie, link, limit } = req.body;

  if (!cookie || !link || !limit) {
    return res.json({ status: false, message: "Missing input." });
  }

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extractToken(cookie, ua);

  if (!token) {
    return res.json({ status: false, message: "Token extraction failed." });
  }

  let success = 0;
  try {
    for (let i = 0; i < limit; i++) {
      const graphRes = await fetch(
        "https://graph.facebook.com/v18.0/me/feed?" +
          new URLSearchParams({
            link: link,
            access_token: token,
            published: "0"
          }),
        {
          method: "POST",
          headers: { "user-agent": ua, cookie: cookie }
        }
      );

      const body = await graphRes.text();
      if (body.includes('"id"')) {
        success++;
      } else {
        break;
      }
    }

    res.json({
      status: true,
      message: `✅ Shared ${success} times.`,
      success_count: success
    });
  } catch (err) {
    console.error("share error:", err);
    res.json({ status: false, message: "Error during share process." });
  }
});

// ------------------------------------
// Start Server
// ------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

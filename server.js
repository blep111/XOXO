import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Middleware
app.use(bodyParser.json());

// Safe dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// User-Agent list
// ----------------------------------------------------
const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// ----------------------------------------------------
// Extract Token (Improved & Robust)
// ----------------------------------------------------
async function extractToken(cookie, ua) {
  try {
    const res = await fetch("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        "referer": "https://www.facebook.com/",
        "cookie": cookie
      },
      timeout: 10000
    });

    const text = await res.text();

    // Try multiple token patterns
    const tokenMatch =
      text.match(/(EAAG\w+)/) ||
      text.match(/(EAAI\w+)/) ||
      text.match(/"access_token":"(EAAG\w+)"/);

    if (!tokenMatch) {
      console.log("[❌] Token not found in response.");
      return null;
    }

    console.log("[✅] Token extracted:", tokenMatch[1].substring(0, 15) + "...");
    return tokenMatch[1];
  } catch (err) {
    console.error("extractToken error:", err.message);
    return null;
  }
}

// ----------------------------------------------------
// Routes
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/share", async (req, res) => {
  const { cookie, link, limit } = req.body;

  if (!cookie || !link || !limit) {
    return res.json({ status: false, message: "⚠️ Missing input fields." });
  }

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extractToken(cookie, ua);

  if (!token) {
    return res.json({
      status: false,
      message: "❌ Failed to extract access token. Check your cookie or try again."
    });
  }

  let success = 0;

  try {
    for (let i = 0; i < parseInt(limit); i++) {
      const url = "https://graph.facebook.com/v18.0/me/feed";
      const params = new URLSearchParams({
        link: link,
        access_token: token,
        published: "0"
      });

      const graphRes = await fetch(`${url}?${params.toString()}`, {
        method: "POST",
        headers: {
          "user-agent": ua,
          "cookie": cookie
        }
      });

      const body = await graphRes.text();
      console.log(`[${i + 1}] Facebook response:`, body);

      if (body.includes('"id"')) {
        success++;
      } else if (body.includes("error")) {
        break; // stop if FB rejects further requests
      }

      // slight delay between requests
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (success > 0) {
      res.json({
        status: true,
        message: `✅ Successfully shared ${success} time(s)!`,
        success_count: success
      });
    } else {
      res.json({
        status: false,
        message:
          "⚠️ No shares were made. Either the token is invalid or the cookie expired."
      });
    }
  } catch (err) {
    console.error("share error:", err);
    res.json({
      status: false,
      message: "❌ Error during share process: " + err.message
    });
  }
});

// ----------------------------------------------------
// Start server
// ----------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// Extract Facebook token
async function extractToken(cookie, ua) {
  try {
    const res = await fetch("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        "cookie": cookie
      },
      timeout: 10000
    });
    const text = await res.text();
    const match =
      text.match(/(EAAG\w+)/) ||
      text.match(/(EAAI\w+)/) ||
      text.match(/"access_token":"(EAAG\w+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// SHARE route
app.post("/api/share", async (req, res) => {
  let { cookie, link, limit } = req.body;
  if (!cookie || !link || !limit)
    return res.json({ status: false, message: "⚠️ Missing input fields." });

  limit = parseInt(limit);
  const cookieList = cookie
    .split(/\r?\n|,/)
    .map((c) => c.trim())
    .filter((c) => c.length > 10);

  if (cookieList.length === 0)
    return res.json({ status: false, message: "❌ No valid cookies found." });

  const tokens = [];
  await Promise.all(
    cookieList.map(async (ck, i) => {
      const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
      const token = await extractToken(ck, ua);
      if (token) tokens.push({ token, cookie: ck, ua });
    })
  );

  if (tokens.length === 0)
    return res.json({ status: false, message: "❌ No valid tokens extracted." });

  const results = [];
  let success = 0;
  let fail = 0;

  // divide total limit evenly
  const perAcc = Math.ceil(limit / tokens.length);

  for (let i = 0; i < tokens.length; i++) {
    const acc = tokens[i];
    let ok = 0,
      bad = 0;

    for (let j = 0; j < perAcc; j++) {
      try {
        const resGraph = await fetch(
          `https://graph.facebook.com/v18.0/me/feed?link=${encodeURIComponent(
            link
          )}&access_token=${acc.token}`,
          {
            method: "POST",
            headers: {
              "user-agent": acc.ua,
              "cookie": acc.cookie
            }
          }
        );
        const body = await resGraph.text();
        if (body.includes('"id"')) ok++;
        else bad++;
      } catch {
        bad++;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    success += ok;
    fail += bad;
    results.push({
      cookieIndex: i + 1,
      success: ok,
      fail: bad
    });
  }

  res.json({
    status: true,
    total_cookies: tokens.length,
    total_success: success,
    total_fail: fail,
    results
  });
});

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);

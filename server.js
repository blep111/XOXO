import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
app.use(express.static("."));

// Fast parallel sharing endpoint
app.post("/api/share", async (req, res) => {
  const { cookie, postId } = req.body;
  if (!cookie || !postId) return res.json({ success: false, message: "Missing data" });

  try {
    const fb_dtsg = await getFbDtsg(cookie);
    if (!fb_dtsg) throw new Error("Invalid cookie or session expired");

    const shareUrl = `https://www.facebook.com/ai.php`;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookie,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
    };
    const body = new URLSearchParams({
      fb_dtsg,
      app_id: "124024574287414",
      action_type: "og.shares",
      object_id: postId,
    });

    const response = await fetch(shareUrl, { method: "POST", headers, body });
    const text = await response.text();

    if (text.includes("error") || text.includes("login")) {
      return res.json({ success: false, message: "Failed to share" });
    }

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

async function getFbDtsg(cookie) {
  try {
    const res = await fetch("https://www.facebook.com/", {
      headers: { Cookie: cookie, "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();
    const match = text.match(/name="fb_dtsg" value="(.*?)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

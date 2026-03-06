export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(200).json({ quotes: [] });

    const url =
      "https://query2.finance.yahoo.com/v1/finance/search?" +
      new URLSearchParams({
        q,
        lang: "en-US",
        region: "US",
        quotesCount: "10",
        newsCount: "0",
      }).toString();

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0", // helps avoid some blocks
        Accept: "application/json,text/plain,*/*",
      },
    });

    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", "application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e?.message || "Yahoo proxy error" });
  }
}
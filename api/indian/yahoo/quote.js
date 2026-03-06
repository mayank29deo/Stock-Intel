export default async function handler(req, res) {
  try {
    const symbols = (req.query.symbols || "").toString().trim();
    if (!symbols) return res.status(400).json({ error: "Missing symbols" });

    const url =
      "https://query1.finance.yahoo.com/v7/finance/quote?" +
      new URLSearchParams({
        symbols,
        lang: "en-US",
        region: "US",
      }).toString();

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json,text/plain,*/*",
      },
    });

    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", "application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e?.message || "Yahoo proxy error" });
  }
}
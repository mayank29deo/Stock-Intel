export default async function handler(req, res) {
  try {
    const symbol = (req.query.symbol || "").toString().trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });

    const apiKey =
      process.env.ALPHA_VANTAGE_API_KEY ||
      process.env.VITE_ALPHA_VANTAGE_API_KEY ||
      "";

    if (!apiKey) {
      return res.status(400).json({
        error:
          "Missing ALPHA_VANTAGE_API_KEY (or VITE_ALPHA_VANTAGE_API_KEY) on server runtime",
      });
    }

    const url =
      "https://www.alphavantage.co/query?" +
      new URLSearchParams({
        function: "GLOBAL_QUOTE",
        symbol,
        apikey: apiKey,
      }).toString();

    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
    });

    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e?.message || "Alpha Vantage proxy error" });
  }
}

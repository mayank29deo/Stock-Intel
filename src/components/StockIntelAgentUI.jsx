// src/components/StockIntelAgentUI.jsx
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  TrendingUp,
  Globe2,
  MessageSquareText,
  ShieldAlert,
  Users,
  Building2,
  Activity,
  Sparkles,
  CircleDollarSign,
  Bell,
  BarChart3,
  Brain,
  Scale,
  ChevronRight,
  SlidersHorizontal,
  Newspaper,
  CandlestickChart,
  Radar,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * =========================
 * API CONFIG (Finnhub + IndianAPI)
 * =========================
 * Vite:  VITE_FINNHUB_API_KEY, VITE_INDIANAPI_STOCK_KEY in .env
 * Next:  NEXT_PUBLIC_FINNHUB_API_KEY (optional legacy)
 *
 * IndianAPI base: https://stock.indianapi.in
 * Auth header: x-api-key: <key>
 */
const API_CONFIG = {
  provider: "hybrid",
  finnhubKey:
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_FINNHUB_API_KEY) ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NEXT_PUBLIC_FINNHUB_API_KEY) ||
    "",
  indianKey:
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_INDIANAPI_STOCK_KEY) ||
    "",
  indianBase: "https://stock.indianapi.in",
};

async function buildHttpError(prefix, res) {
  let details = "";
  try {
    const body = await res.text();
    if (body) details = `: ${body.slice(0, 220)}`;
  } catch {
    details = "";
  }
  return `${prefix} (${res.status})${details}`;
}

/**
 * =========================
 * IndianAPI helpers
 * =========================
 */
async function indianFetch(path, params = {}) {
  if (!API_CONFIG.indianKey) throw new Error("Missing IndianAPI key");
  const qs = new URLSearchParams(params);
  const url = `${API_CONFIG.indianBase}${path}?${qs.toString()}`;
  const res = await fetch(url, { headers: { "x-api-key": API_CONFIG.indianKey } });
  if (!res.ok) throw new Error(await buildHttpError("IndianAPI failed", res));
  return await res.json();
}

function normalizeIndiaTicker(t) {
  const raw = (t || "").trim().toUpperCase();
  // Allow RELIANCE.NS / RELIANCE.BO but strip suffix for name lookup
  return raw.replace(/\.(NS|BO)$/i, "");
}

// /industry_search?query=... (best for suggestions)
async function searchStocksIndian(searchText) {
  const q = (searchText || "").trim();
  if (!q) return [];
  if (!API_CONFIG.indianKey) return [];

  const json = await indianFetch("/industry_search", { query: q });
  const rows = Array.isArray(json) ? json : [];

  // Prefer entries with NSE/BSE codes first
  const sorted = [...rows].sort((a, b) => {
    const aHas = !!(a.exchangeCodeNsi || a.exchangeCodeNse || a.exchangeCodeBse);
    const bHas = !!(b.exchangeCodeNsi || b.exchangeCodeNse || b.exchangeCodeBse);
    return Number(bHas) - Number(aHas);
  });

  return sorted.slice(0, 12).map((r) => {
    const nse = r.exchangeCodeNsi || r.exchangeCodeNse || r.exchangeCodeNSE || r.nseRic || r.nse;
    const bse = r.exchangeCodeBse || r.exchangeCodeBse || r.exchangeCodeBSE || r.bseRic || r.bse;

    // Prefer NSE if present; fallback to BSE; else attempt commonName
    const chosen = (nse || bse || r.commonName || "").toString().toUpperCase().trim();

    return {
      ticker: chosen,
      name: r.commonName || r.mgIndustry || r.mgSector || "Indian Stock",
      source: "api",
      type: r.stockType || "Equity",
      _india: true,
      _exchangeHint: nse ? "NSE" : bse ? "BSE" : "",
    };
  }).filter((x) => x.ticker);
}

// /stock?name=... (best for quote by company name)
async function getQuoteIndian(tickerOrName) {
  const name = normalizeIndiaTicker(tickerOrName);
  const d = await indianFetch("/stock", { name });

  const symbol = (d?.tickerId || name || "").toString().toUpperCase();
  const companyName = d?.companyName || symbol;

  const nse = d?.currentPrice?.NSE;
  const bse = d?.currentPrice?.BSE;

  const price = Number(nse ?? bse ?? 0) || 0;
  const changePct = Number(d?.percentChange ?? 0) || 0;

  return {
    symbol,
    name: companyName,
    price,
    prevClose: 0, // provider may not supply in a stable field
    changePct,
    exchange: nse != null ? "NSE" : bse != null ? "BSE" : "",
    indianApiRaw: d,
  };
}

/**
 * =========================
 * Hybrid: Finnhub + IndianAPI
 * =========================
 */
async function searchStocksAPI(searchText) {
  const q = (searchText || "").trim();
  if (!q) return [];

  const tasks = [];

  // Finnhub (global)
  if (API_CONFIG.finnhubKey) {
    tasks.push(
      (async () => {
        const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(
          q
        )}&token=${API_CONFIG.finnhubKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(await buildHttpError("Search API failed", res));
        const json = await res.json();

        return (json.result || [])
          .filter((r) => r.symbol && r.description)
          .slice(0, 12)
          .map((r) => ({
            ticker: r.symbol,
            name: r.description,
            source: "api",
            type: r.type || "",
            _india: false,
            _exchangeHint: "",
          }));
      })()
    );
  }

  // IndianAPI (NSE/BSE)
  if (API_CONFIG.indianKey) tasks.push(searchStocksIndian(q));

  const results = (await Promise.allSettled(tasks))
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // De-dupe by ticker (keep first occurrence)
  const seen = new Set();
  return results
    .filter((r) => (seen.has(r.ticker) ? false : (seen.add(r.ticker), true)))
    .slice(0, 12);
}

async function getQuoteAPI(ticker) {
  const symbol = (ticker || "").trim().toUpperCase();
  if (!symbol) throw new Error("Ticker missing");

  // If user typed .NS/.BO, go IndianAPI first
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    if (!API_CONFIG.indianKey) throw new Error("Missing IndianAPI key");
    return await getQuoteIndian(symbol);
  }

  // 1) Try Finnhub if available (best for US/global)
  if (API_CONFIG.finnhubKey) {
    try {
      const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
        symbol
      )}&token=${API_CONFIG.finnhubKey}`;
      const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
        symbol
      )}&token=${API_CONFIG.finnhubKey}`;

      const [quoteRes, profileRes] = await Promise.all([
        fetch(quoteUrl),
        fetch(profileUrl),
      ]);

      if (!quoteRes.ok)
        throw new Error(await buildHttpError("Quote API failed", quoteRes));

      const quote = await quoteRes.json();
      const profile = profileRes.ok ? await profileRes.json() : {};

      if (quote.c == null || Number.isNaN(Number(quote.c))) {
        throw new Error("No quote returned for ticker");
      }

      return {
        symbol,
        name: profile.name || symbol,
        price: Number(quote.c) || 0,
        prevClose: Number(quote.pc) || 0,
        changePct: Number(quote.dp) || 0,
        exchange: profile.exchange || "",
        finnhubProfile: profile,
      };
    } catch {
      // fall through to IndianAPI
    }
  }

  // 2) Fallback to IndianAPI
  if (API_CONFIG.indianKey) {
    return await getQuoteIndian(symbol);
  }

  throw new Error("Missing API key");
}

/**
 * =========================
 * Demo dataset (rich samples)
 * =========================
 */
const STOCKS = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    price: 912.35,
    chg: 2.83,
    horizon: "Swing",
    thesis:
      "AI infrastructure demand remains strong, but valuation sensitivity to macro rates and export controls is elevated.",
    scores: {
      fundamentals: 84,
      sentiment: 78,
      technicals: 73,
      insider: 58,
      geopolitics: 46,
      tariffs: 52,
      compliance: 71,
      optionsFlow: 76,
      institutions: 81,
    },
    insights: [
      {
        type: "Geo-Political",
        tone: "Watch",
        text: "US-China chip restrictions continue to be the highest external risk to revenue mix and guidance confidence.",
      },
      {
        type: "Public Sentiment",
        tone: "Positive",
        text: "Retail and social chatter remains strongly bullish, but short-term sentiment is crowded and prone to sharp reversals.",
      },
      {
        type: "Insider Activity",
        tone: "Neutral",
        text: "Routine executive selling present; no unusual clustered insider accumulation signal currently.",
      },
      {
        type: "Tariffs / Trade",
        tone: "Caution",
        text: "Supply-chain and cross-border policy shifts may impact margin expectations for some segments.",
      },
      {
        type: "Institutions",
        tone: "Positive",
        text: "Institutional positioning remains constructive, with accumulation bias in AI-linked baskets.",
      },
    ],
    catalysts: [
      { label: "Earnings / Guidance", impact: "High", eta: "12d" },
      { label: "US Policy / Export Update", impact: "High", eta: "Unknown" },
      { label: "Sector Rotation (Rates)", impact: "Medium", eta: "This week" },
    ],
    headlines: [
      "AI capex commentary from hyperscalers supports demand visibility",
      "Export policy debate revives risk premium in semiconductor names",
      "Analyst revisions mixed as expectations remain elevated",
    ],
  },
  {
    ticker: "TCS",
    name: "Tata Consultancy Services",
    price: 4278.9,
    chg: -0.64,
    horizon: "Positional",
    thesis:
      "High-quality execution and strong client relationships support resilience, while global macro and discretionary IT spending remain key swing factors.",
    scores: {
      fundamentals: 88,
      sentiment: 67,
      technicals: 61,
      insider: 74,
      geopolitics: 64,
      tariffs: 81,
      compliance: 90,
      optionsFlow: 55,
      institutions: 79,
    },
    insights: [
      {
        type: "Geo-Political",
        tone: "Neutral",
        text: "Global client budgets are influenced by macro and regional growth expectations more than direct trade shocks.",
      },
      {
        type: "Public Sentiment",
        tone: "Neutral",
        text: "Market sentiment is stable but not euphoric; investors prefer proof of acceleration in deal conversion.",
      },
      {
        type: "Insider Activity",
        tone: "Positive",
        text: "No stress signals from insider behavior; governance perception remains strong.",
      },
      {
        type: "Tariffs / Trade",
        tone: "Positive",
        text: "Services model faces less direct tariff impact versus manufacturing-heavy businesses.",
      },
      {
        type: "Institutions",
        tone: "Positive",
        text: "Domestic and long-only institutional ownership remains supportive on dips.",
      },
    ],
    catalysts: [
      { label: "Large Deal Wins", impact: "High", eta: "Rolling" },
      { label: "Quarterly Margin Commentary", impact: "High", eta: "28d" },
      { label: "Global IT Spend Signals", impact: "Medium", eta: "2–6w" },
    ],
    headlines: [
      "IT services outlook tied to client discretionary revival timelines",
      "Deal pipeline remains healthy but conversion pace under watch",
      "Margin resilience and operational discipline continue to anchor valuations",
    ],
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    price: 211.14,
    chg: -3.92,
    horizon: "Trading",
    thesis:
      "Narrative and momentum remain powerful, but execution volatility, pricing pressure, and regulatory headlines can dominate short-term direction.",
    scores: {
      fundamentals: 62,
      sentiment: 72,
      technicals: 49,
      insider: 51,
      geopolitics: 58,
      tariffs: 44,
      compliance: 53,
      optionsFlow: 83,
      institutions: 60,
    },
    insights: [
      {
        type: "Geo-Political",
        tone: "Caution",
        text: "International policy and EV incentive shifts can quickly alter demand assumptions.",
      },
      {
        type: "Public Sentiment",
        tone: "Mixed",
        text: "High engagement and polarized sentiment increase volatility around news flow.",
      },
      {
        type: "Insider Activity",
        tone: "Neutral",
        text: "No decisive insider accumulation pattern; market reacts more to narrative than insider cues.",
      },
      {
        type: "Tariffs / Trade",
        tone: "Caution",
        text: "Trade barriers and region-specific policy could impact pricing strategy and unit economics.",
      },
      {
        type: "Institutions",
        tone: "Mixed",
        text: "Institutional ownership remains large, but conviction varies with margin trajectory.",
      },
    ],
    catalysts: [
      { label: "Delivery Numbers", impact: "High", eta: "9d" },
      { label: "Regulatory / Safety Headlines", impact: "Medium", eta: "Rolling" },
      { label: "Price Cut / Demand Signals", impact: "High", eta: "This month" },
    ],
    headlines: [
      "EV pricing competition keeps auto gross margins in focus",
      "Options activity surges ahead of delivery update",
      "Regulatory headlines continue to shape intraday swings",
    ],
  },
];

const toneMap = {
  Positive: "bg-emerald-500/15 text-emerald-700 border-emerald-400/40",
  Neutral: "bg-slate-500/10 text-slate-700 border-slate-400/30",
  Mixed: "bg-amber-500/15 text-amber-700 border-amber-400/40",
  Watch: "bg-orange-500/15 text-orange-700 border-orange-400/40",
  Caution: "bg-red-500/15 text-red-700 border-red-400/40",
};

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function recommendationEngine(scores) {
  const weighted =
    scores.fundamentals * 0.22 +
    scores.sentiment * 0.12 +
    scores.technicals * 0.12 +
    scores.insider * 0.08 +
    scores.geopolitics * 0.12 +
    scores.tariffs * 0.08 +
    scores.compliance * 0.08 +
    scores.optionsFlow * 0.08 +
    scores.institutions * 0.1;

  const conviction = Math.round(clamp(weighted));
  let action = "Hold";
  let band = "Balanced";
  let note =
    "Risk-reward is balanced right now. Track catalysts and wait for a cleaner edge.";

  if (conviction >= 78) {
    action = "Buy";
    band = "High Conviction";
    note =
      "Multi-factor setup is strong. Consider accumulating with risk controls around near-term catalysts.";
  } else if (conviction >= 65) {
    action = "Keep / Add on Dips";
    band = "Constructive";
    note =
      "Structure remains healthy, but entries are better when sentiment cools or price retraces.";
  } else if (conviction >= 52) {
    action = "Hold";
    band = "Balanced";
    note =
      "Signals are mixed. Let the next catalyst or trend confirmation improve clarity.";
  } else if (conviction >= 40) {
    action = "Reduce / Watch Closely";
    band = "Fragile";
    note =
      "Downside risks are increasing. Tighten stop-loss / allocation and monitor headline risk.";
  } else {
    action = "Sell / Exit";
    band = "Risk-Off";
    note = "Broad signal weakness and elevated risk suggest capital protection first.";
  }

  return { conviction, action, band, note };
}

function scoreColor(value) {
  if (value >= 75) return "text-emerald-700";
  if (value >= 55) return "text-amber-700";
  return "text-red-700";
}

/**
 * =========================
 * Dynamic fallback profile (works without API)
 * =========================
 */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function seededNumber(seed, min, max) {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return min + frac * (max - min);
}

function buildDynamicStockProfile(input) {
  const raw = (input || "").trim();
  const ticker = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "") || "AAPL";
  const seed = hashString(ticker);
  const price = Number(seededNumber(seed + 1, 25, 2400).toFixed(2));
  const chg = Number(seededNumber(seed + 2, -4.8, 4.8).toFixed(2));
  const horizons = ["Trading", "Swing", "Positional"];
  const horizon = horizons[seed % horizons.length];

  const scores = {
    fundamentals: Math.round(seededNumber(seed + 10, 48, 92)),
    sentiment: Math.round(seededNumber(seed + 11, 42, 88)),
    technicals: Math.round(seededNumber(seed + 12, 40, 90)),
    insider: Math.round(seededNumber(seed + 13, 35, 85)),
    geopolitics: Math.round(seededNumber(seed + 14, 30, 82)),
    tariffs: Math.round(seededNumber(seed + 15, 35, 88)),
    compliance: Math.round(seededNumber(seed + 16, 45, 94)),
    optionsFlow: Math.round(seededNumber(seed + 17, 38, 91)),
    institutions: Math.round(seededNumber(seed + 18, 44, 90)),
  };

  return {
    ticker,
    name: `${ticker} (Live data pending)`,
    price,
    chg,
    horizon,
    thesis: `This is a generated preview profile for ${ticker}. Wire a live market/news API to replace demo values with real-time price, fundamentals, sentiment, insider and macro signals.`,
    scores,
    insights: [
      {
        type: "Geo-Political",
        tone: scores.geopolitics >= 65 ? "Neutral" : "Watch",
        text: `Policy and regional exposure for ${ticker} should be reviewed against revenue concentration and supply-chain geography.`,
      },
      {
        type: "Public Sentiment",
        tone:
          scores.sentiment >= 70
            ? "Positive"
            : scores.sentiment >= 55
            ? "Neutral"
            : "Mixed",
        text: `Sentiment placeholder for ${ticker}; connect social/news sentiment pipelines for live narrative tracking.`,
      },
      {
        type: "Insider Activity",
        tone: scores.insider >= 70 ? "Positive" : "Neutral",
        text: `Insider signal is currently mocked. Integrate SEC/promoter disclosures to detect unusual clusters.`,
      },
      {
        type: "Tariffs / Trade",
        tone: scores.tariffs >= 60 ? "Neutral" : "Caution",
        text: `Trade and tariff sensitivity for ${ticker} should be mapped using supplier/customer geography.`,
      },
      {
        type: "Institutions",
        tone: scores.institutions >= 70 ? "Positive" : "Mixed",
        text: `Institutional positioning is a placeholder score until holdings and flow data are connected.`,
      },
    ],
    catalysts: [
      { label: "Earnings / Results", impact: "High", eta: "TBD" },
      { label: "Company Guidance / Announcements", impact: "Medium", eta: "Rolling" },
      { label: "Sector / Macro Trigger", impact: "Medium", eta: "This month" },
    ],
    headlines: [
      `${ticker}: Connect live news feed to populate headline narrative`,
      `${ticker}: Add sentiment + event classifier for news impact scoring`,
      `${ticker}: Enable risk alerts for policy, insider, and earnings events`,
    ],
  };
}

/**
 * =========================
 * Live quote profile (Finnhub / IndianAPI)
 * =========================
 */
function buildLiveStockProfile(quoteData) {
  const ticker = quoteData.symbol;
  const base = buildDynamicStockProfile(ticker);
  return {
    ...base,
    ticker,
    name: quoteData.name || base.name,
    price: Number(
      quoteData.price?.toFixed?.(2) ?? quoteData.price ?? base.price
    ),
    chg: Number(
      quoteData.changePct?.toFixed?.(2) ?? quoteData.changePct ?? base.chg
    ),
    thesis: `Live market quote connected for ${ticker}. Price and daily move are real-time/near real-time (provider dependent). Multi-factor intelligence blocks remain mock-scored until news/sentiment/insider/compliance sources are connected.`,
    headlines: [
      `${ticker}: Live quote connected ✅`,
      `${ticker}: Next step → wire news + sentiment APIs`,
      `${ticker}: Next step → insider, filings, and institutional data feeds`,
    ],
    _mode: "live-quote",
    _exchange: quoteData.exchange || "",
  };
}

function MiniFactor({ icon: Icon, label, value, subtle }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-slate-900/5 flex items-center justify-center">
            <Icon className="h-4 w-4 text-slate-700" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{label}</p>
            <p className={`text-sm font-semibold ${scoreColor(value)}`}>
              {value}/100
            </p>
          </div>
        </div>
        <div className="w-20">
          <Progress value={value} className="h-2 bg-slate-200/70" />
        </div>
      </div>
      {subtle ? (
        <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{subtle}</p>
      ) : null}
    </motion.div>
  );
}

function Ring({ value }) {
  const angle = Math.round((clamp(value) / 100) * 360);
  return (
    <div
      className="relative h-28 w-28 rounded-full grid place-items-center"
      style={{
        background: `conic-gradient(rgba(15,23,42,0.85) ${angle}deg, rgba(148,163,184,0.18) ${angle}deg)`,
      }}
    >
      <div className="h-20 w-20 rounded-full bg-white/95 border border-white shadow-inner grid place-items-center">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-900">{value}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Conviction
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StockIntelAgentUI() {
  const [query, setQuery] = useState("NVDA");
  const [selected, setSelected] = useState("NVDA");
  const [searchOpen, setSearchOpen] = useState(false);

  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [liveProfile, setLiveProfile] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const [timeframe, setTimeframe] = useState("30d");
  const [riskMode, setRiskMode] = useState("balanced");
  const [watchlist, setWatchlist] = useState(["NVDA", "TCS"]);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STOCKS;
    return STOCKS.filter(
      (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [query]);

  // Live symbol suggestions (Hybrid search)
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    if (!q || q.length < 1) {
      setRemoteSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const results = await searchStocksAPI(q);
        if (!cancelled) setRemoteSuggestions(results);
      } catch {
        if (!cancelled) setRemoteSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Live quote for non-local tickers (Hybrid quote)
  useEffect(() => {
    let cancelled = false;
    const q = (query || "").trim().toUpperCase();
    const isLocal = STOCKS.some((s) => s.ticker === q);

    async function loadLive() {
      if (!q || isLocal) {
        setLiveProfile(null);
        setApiError("");
        setApiLoading(false);
        return;
      }

      setApiLoading(true);
      setApiError("");
      try {
        const quote = await getQuoteAPI(q);
        if (!cancelled) setLiveProfile(buildLiveStockProfile(quote));
      } catch (e) {
        if (!cancelled) {
          setLiveProfile(null);
          setApiError(e?.message || "API unavailable");
        }
      } finally {
        if (!cancelled) setApiLoading(false);
      }
    }

    loadLive();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const current = useMemo(() => {
    const q = query.trim();
    const qUpper = q.toUpperCase();
    const selectedMatch = STOCKS.find((s) => s.ticker === selected);
    const exactTickerMatch = STOCKS.find((s) => s.ticker === qUpper);
    const exactNameMatch = STOCKS.find((s) => s.name.toLowerCase() === q.toLowerCase());

    if (exactTickerMatch) return exactTickerMatch;
    if (exactNameMatch) return exactNameMatch;
    if (liveProfile && liveProfile.ticker === qUpper) return liveProfile;
    if (selectedMatch && (!q || qUpper === selectedMatch.ticker)) return selectedMatch;

    if (q) return buildDynamicStockProfile(q);
    return selectedMatch || STOCKS[0];
  }, [query, selected, liveProfile]);

  const adjustedReco = useMemo(() => {
    const modifier = riskMode === "aggressive" ? 6 : riskMode === "conservative" ? -6 : 0;
    return recommendationEngine({
      ...current.scores,
      technicals: clamp(current.scores.technicals + modifier),
      sentiment: clamp(current.scores.sentiment + modifier / 2),
    });
  }, [current, riskMode]);

  const radarLike = [
    ["Fundamentals", current.scores.fundamentals, Brain],
    ["Sentiment", current.scores.sentiment, MessageSquareText],
    ["Technicals", current.scores.technicals, CandlestickChart],
    ["Insider", current.scores.insider, Users],
    ["Geo-Politics", current.scores.geopolitics, Globe2],
    ["Tariffs", current.scores.tariffs, Scale],
    ["Compliance", current.scores.compliance, ShieldAlert],
    ["Institutions", current.scores.institutions, Building2],
  ];

  const toggleWatch = () => {
    setWatchlist((prev) =>
      prev.includes(current.ticker)
        ? prev.filter((t) => t !== current.ticker)
        : [...prev, current.ticker]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-zinc-50 to-stone-100 text-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-lg p-4 md:p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-9 w-9 rounded-2xl bg-slate-900 text-white grid place-items-center shadow">
                  <Sparkles className="h-4 w-4" />
                </div>
                <Badge className="rounded-full bg-slate-900/90 text-white hover:bg-slate-900">
                  AI Stock Intelligence Agent
                </Badge>
              </div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
                Multi-factor stock view that actually feels intelligent
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                Geo-political signals, public sentiment, insiders, trade/tariffs,
                compliance, institutional flow, and technical context — merged
                into one crisp action band.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search any stock (ticker or company name)"
                  className="pl-9 rounded-2xl bg-white/80 border-white shadow-sm"
                />

                {searchOpen && (
                  <div className="absolute z-30 mt-2 w-full rounded-2xl border border-white/80 bg-white/95 backdrop-blur shadow-xl overflow-hidden">
                    <div className="max-h-72 overflow-auto p-2 space-y-1">
                      {!!remoteSuggestions.length && (
                        <div className="px-2 pt-1 pb-1 text-[11px] uppercase tracking-wide text-slate-500">
                          Live API suggestions
                        </div>
                      )}
                      {remoteSuggestions.map((s) => (
                        <button
                          key={`api-${s.ticker}`}
                          onClick={() => {
                            setSelected(s.ticker);
                            setQuery(s.ticker);
                            setSearchOpen(false);
                          }}
                          className="w-full text-left rounded-xl px-3 py-2 hover:bg-slate-100 transition flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">
                              {s.ticker}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {s.name}
                            </p>
                          </div>

                          {/* Badge: show INDIA vs GLOBAL */}
                          <Badge
                            className={`rounded-full border ${
                              s._india
                                ? "bg-emerald-500/10 text-emerald-700 border-emerald-300/40"
                                : "bg-indigo-500/10 text-indigo-700 border-indigo-300/40"
                            }`}
                          >
                            {s._india ? (s._exchangeHint || "INDIA") : "GLOBAL"}
                          </Badge>
                        </button>
                      ))}

                      {!!filteredStocks.length && (
                        <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-500">
                          Local samples
                        </div>
                      )}
                      {filteredStocks.length > 0 ? (
                        filteredStocks.map((s) => (
                          <button
                            key={s.ticker}
                            onClick={() => {
                              setSelected(s.ticker);
                              setQuery(s.ticker);
                              setSearchOpen(false);
                            }}
                            className="w-full text-left rounded-xl px-3 py-2 hover:bg-slate-100 transition flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {s.ticker}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {s.name}
                              </p>
                            </div>
                            <Badge className="rounded-full bg-slate-900/10 text-slate-700 border border-slate-300/30">
                              Sample
                            </Badge>
                          </button>
                        ))
                      ) : !remoteSuggestions.length ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
                          <p className="text-xs text-slate-600">No matches yet.</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Type a ticker and click Analyze. Add API keys to enable
                            live search suggestions + quotes.
                          </p>
                          {!API_CONFIG.finnhubKey && (
                            <p className="text-xs text-amber-700 mt-2">
                              Add VITE_FINNHUB_API_KEY to enable global search/quotes.
                            </p>
                          )}
                          {!API_CONFIG.indianKey && (
                            <p className="text-xs text-amber-700 mt-1">
                              Add VITE_INDIANAPI_STOCK_KEY to enable NSE/BSE search/quotes.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              <Select
                value={selected}
                onValueChange={(v) => {
                  setSelected(v);
                  setQuery(v);
                }}
              >
                <SelectTrigger className="w-full sm:w-44 rounded-2xl bg-white/80 border-white shadow-sm">
                  <SelectValue placeholder="Quick samples" />
                </SelectTrigger>
                <SelectContent>
                  {STOCKS.map((s) => (
                    <SelectItem key={s.ticker} value={s.ticker}>
                      {s.ticker} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow"
                onClick={() => {
                  const q = query.trim();
                  if (!q) return;
                  setSelected(q.toUpperCase());
                  setSearchOpen(false);
                }}
              >
                Analyze <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Hero band */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="xl:col-span-2"
          >
            <Card className="rounded-3xl border-white/70 bg-white/75 backdrop-blur-xl shadow-lg overflow-hidden">
              <CardContent className="p-5 md:p-6">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-slate-100 border border-slate-200 text-slate-700"
                        >
                          {current.horizon}
                        </Badge>
                        <Badge className="rounded-full bg-indigo-500/10 text-indigo-700 border border-indigo-300/30">
                          {timeframe} view
                        </Badge>
                      </div>
                      <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                        {current.ticker}{" "}
                        <span className="text-slate-500 font-medium">
                          · {current.name}
                        </span>
                      </h2>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="text-2xl font-bold">
                          {Number(current.price).toLocaleString()}
                        </div>
                        <div
                          className={`flex items-center gap-1 text-sm font-semibold ${
                            current.chg >= 0 ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {current.chg >= 0 ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                          {Math.abs(Number(current.chg)).toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Ring value={adjustedReco.conviction} />
                      <div className="space-y-2 max-w-56">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Suggestion Band
                        </div>
                        <div className="text-lg font-semibold leading-tight">
                          {adjustedReco.action}
                        </div>
                        <Badge className="rounded-full border bg-slate-900/5 text-slate-700 border-slate-300/40">
                          {adjustedReco.band}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/80 bg-gradient-to-r from-white/70 to-slate-50/70 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center shrink-0">
                        <Brain className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          AI Wrap-up (crisp, no fluff)
                        </p>
                        <p className="text-sm text-slate-700 mt-1">
                          {current.thesis}
                        </p>

                        <p className="text-xs text-slate-500 mt-2">
                          {adjustedReco.note}
                        </p>

                        {!!current._mode && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge className="rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-300/40">
                              Live Quote Mode
                            </Badge>
                            {current._exchange ? (
                              <Badge className="rounded-full bg-slate-900/5 text-slate-700 border border-slate-300/40">
                                {current._exchange}
                              </Badge>
                            ) : null}
                          </div>
                        )}

                        {apiLoading && (
                          <p className="text-xs text-slate-500 mt-2">
                            Fetching live quote…
                          </p>
                        )}

                        {!API_CONFIG.finnhubKey && !API_CONFIG.indianKey && (
                          <p className="text-xs text-amber-700 mt-2">
                            Add VITE_FINNHUB_API_KEY and/or VITE_INDIANAPI_STOCK_KEY to enable live API search + quotes.
                          </p>
                        )}

                        {!!apiError && !current._mode && (
                          <p className="text-xs text-amber-700 mt-2">
                            API fallback active: {apiError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniFactor
                      icon={Globe2}
                      label="Geo-Politics"
                      value={current.scores.geopolitics}
                      subtle="Export control / policy sensitivity"
                    />
                    <MiniFactor
                      icon={MessageSquareText}
                      label="Public Sentiment"
                      value={current.scores.sentiment}
                      subtle="Retail + social chatter quality"
                    />
                    <MiniFactor
                      icon={Users}
                      label="Insider Activity"
                      value={current.scores.insider}
                      subtle="Clustered buy/sell signal weight"
                    />
                    <MiniFactor
                      icon={Scale}
                      label="Tariffs & Trade"
                      value={current.scores.tariffs}
                      subtle="Cross-border policy / duty impact"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <Card className="rounded-3xl border-white/70 bg-white/75 backdrop-blur-xl shadow-lg h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Analyst Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-2">Risk Mode</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["conservative", "Conservative"],
                      ["balanced", "Balanced"],
                      ["aggressive", "Aggressive"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setRiskMode(key)}
                        className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                          riskMode === key
                            ? "bg-slate-900 text-white border-slate-900 shadow"
                            : "bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-2">Time Horizon</p>
                  <div className="grid grid-cols-3 gap-2">
                    {["7d", "30d", "90d"].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`rounded-xl border px-2 py-2 text-xs font-medium ${
                          timeframe === tf
                            ? "bg-indigo-500/10 border-indigo-300 text-indigo-700"
                            : "bg-white/80 border-slate-200 text-slate-700"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Alert readiness</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm font-semibold">
                      Catalyst + Risk Monitoring
                    </p>
                    <Bell className="h-4 w-4 text-slate-500" />
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Set threshold alerts on conviction drop, sentiment spike,
                    insider cluster, or policy headline risk.
                  </p>
                </div>

                <Button
                  onClick={toggleWatch}
                  variant="outline"
                  className="w-full rounded-2xl border-slate-300"
                >
                  {watchlist.includes(current.ticker)
                    ? "Remove from Watchlist"
                    : "Add to Watchlist"}
                </Button>

                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Your watchlist</p>
                  <div className="flex flex-wrap gap-2">
                    {watchlist.map((t) => (
                      <Badge
                        key={t}
                        className="rounded-full bg-slate-900/10 text-slate-700 border border-slate-300/40"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Main intelligence tabs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="rounded-3xl border-white/70 bg-white/75 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4 md:p-5">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 h-auto bg-transparent p-0 mb-4">
                  {[
                    ["overview", "Overview"],
                    ["geo", "Geo"],
                    ["sentiment", "Sentiment"],
                    ["insiders", "Insiders"],
                    ["trade", "Tariffs"],
                    ["compliance", "Compliance"],
                    ["flow", "Flow"],
                    ["news", "News"],
                  ].map(([v, label]) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-xl border data-[state=active]:bg-slate-900 data-[state=active]:text-white bg-white/70 border-slate-200"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm lg:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Radar className="h-4 w-4" /> Multi-factor matrix
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {radarLike.map(([label, value, Icon]) => (
                            <div
                              key={label}
                              className="rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-slate-600" />
                                  <span className="text-sm font-medium">
                                    {label}
                                  </span>
                                </div>
                                <span
                                  className={`text-sm font-semibold ${scoreColor(
                                    value
                                  )}`}
                                >
                                  {value}
                                </span>
                              </div>
                              <Progress value={value} className="h-2 bg-slate-200" />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4" /> Catalyst stack
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {current.catalysts.map((c, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{c.label}</p>
                              <Badge
                                className={`rounded-full ${
                                  c.impact === "High"
                                    ? "bg-red-500/10 text-red-700 border border-red-300/40"
                                    : "bg-amber-500/10 text-amber-700 border border-amber-300/40"
                                }`}
                              >
                                {c.impact}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              ETA: {c.eta}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> Smart recommendation band
                        (with why)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                          <p className="text-xs text-slate-500">Primary Action</p>
                          <p className="text-xl font-semibold mt-1">
                            {adjustedReco.action}
                          </p>
                          <Badge className="mt-2 rounded-full bg-slate-900/10 text-slate-700 border border-slate-300/30">
                            {adjustedReco.band}
                          </Badge>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                          <p className="text-xs text-slate-500">Conviction Score</p>
                          <p className="text-xl font-semibold mt-1">
                            {adjustedReco.conviction}/100
                          </p>
                          <Progress
                            className="mt-3 h-2 bg-slate-200"
                            value={adjustedReco.conviction}
                          />
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                          <p className="text-xs text-slate-500">Decision Context</p>
                          <p className="text-sm text-slate-700 mt-1">
                            {adjustedReco.note}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="geo" className="space-y-3">
                  <InsightPanel
                    title="Geo-political and macro lens"
                    icon={Globe2}
                    items={current.insights.filter((i) => i.type === "Geo-Political")}
                    extra="Maps policy exposure, export controls, regional demand sensitivity, sanctions risk, and macro shock transmission."
                  />
                </TabsContent>

                <TabsContent value="sentiment" className="space-y-3">
                  <InsightPanel
                    title="Public sentiment intelligence"
                    icon={MessageSquareText}
                    items={current.insights.filter((i) => i.type === "Public Sentiment")}
                    extra="Blends retail chatter quality, narrative momentum, crowding risk, and tone shifts around catalysts."
                  />
                </TabsContent>

                <TabsContent value="insiders" className="space-y-3">
                  <InsightPanel
                    title="Insider behavior and governance"
                    icon={Users}
                    items={current.insights.filter((i) => i.type === "Insider Activity")}
                    extra="Tracks clustered buys/sells, routine selling filters, management confidence signals, and governance confidence."
                  />
                </TabsContent>

                <TabsContent value="trade" className="space-y-3">
                  <InsightPanel
                    title="Tariffs, duties, and trade shocks"
                    icon={Scale}
                    items={current.insights.filter((i) => i.type === "Tariffs / Trade")}
                    extra="Monitors trade barriers, duty changes, sourcing risk, and potential margin pass-through pressure."
                  />
                </TabsContent>

                <TabsContent value="compliance" className="space-y-3">
                  <InsightPanel
                    title="Legal and compliance posture"
                    icon={ShieldAlert}
                    items={[
                      {
                        type: "Compliance",
                        tone:
                          current.scores.compliance > 75
                            ? "Positive"
                            : current.scores.compliance > 55
                            ? "Neutral"
                            : "Caution",
                        text:
                          current.scores.compliance > 75
                            ? "Compliance profile appears stable with no major risk concentration visible in the current model snapshot."
                            : "Compliance profile is acceptable but requires monitoring for emerging disputes, notices, or regulatory commentary.",
                      },
                    ]}
                    extra="Surface ongoing legal risk, enforcement exposure, governance concerns, and disclosure quality indicators."
                  />
                </TabsContent>

                <TabsContent value="flow" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                      title="Options Flow"
                      value={`${current.scores.optionsFlow}/100`}
                      hint="Aggressive activity + unusual positioning"
                      icon={CircleDollarSign}
                    />
                    <StatCard
                      title="Institutional Positioning"
                      value={`${current.scores.institutions}/100`}
                      hint="Long-only and smart-money stance"
                      icon={Building2}
                    />
                    <StatCard
                      title="Price/Trend Structure"
                      value={`${current.scores.technicals}/100`}
                      hint="Momentum, trend quality, and reversals"
                      icon={BarChart3}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="news" className="space-y-3">
                  <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Newspaper className="h-4 w-4" /> Narrative tracker
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {current.headlines.map((h, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-start justify-between gap-3"
                        >
                          <p className="text-sm text-slate-700">{h}</p>
                          <Badge className="rounded-full bg-slate-900/10 text-slate-700 border border-slate-300/30">
                            Signal
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bottom engagement cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="lg:col-span-2"
          >
            <Card className="rounded-3xl border-white/70 bg-white/75 backdrop-blur-xl shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" /> Ask the agent (engagement-first)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    "What can go wrong for this stock in the next 30 days?",
                    "Summarize the insider + institutional signal conflict",
                    "How much of the thesis depends on policy risk?",
                    "Give me a buy-on-dips plan with 3 trigger zones",
                    "What news would flip this from Hold to Buy?",
                    "Compare this with a safer stock in the same theme",
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      className="text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 p-3 shadow-sm transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-xl bg-slate-900/5 grid place-items-center mt-0.5">
                          <MessageSquareText className="h-4 w-4 text-slate-700" />
                        </div>
                        <span className="text-sm text-slate-700">{q}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="rounded-3xl border-white/70 bg-white/75 backdrop-blur-xl shadow-lg h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Portfolio pulse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {watchlist.map((t) => {
                  const s = STOCKS.find((x) => x.ticker === t);
                  if (!s) return null;
                  const r = recommendationEngine(s.scores);
                  return (
                    <div
                      key={t}
                      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{s.ticker}</p>
                          <p className="text-xs text-slate-500">{s.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{r.action}</p>
                          <p className="text-xs text-slate-500">{r.conviction}/100</p>
                        </div>
                      </div>
                      <Progress value={r.conviction} className="mt-3 h-2 bg-slate-200" />
                    </div>
                  );
                })}
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <p className="text-xs text-slate-600">
                    This panel can later show your actual holdings, average buy price,
                    and personalized risk advice.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function InsightPanel({ title, icon: Icon, items, extra }) {
  return (
    <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((i, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium">{i.type}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full border ${
                  toneMap[i.tone] || toneMap.Neutral
                }`}
              >
                {i.tone}
              </span>
            </div>
            <p className="text-sm text-slate-700">{i.text}</p>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
          <p className="text-xs text-slate-600">{extra}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, hint, icon: Icon }) {
  return (
    <Card className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">{title}</p>
            <p className="text-lg font-semibold mt-1">{value}</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-slate-900/5 grid place-items-center">
            <Icon className="h-4 w-4 text-slate-700" />
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-2">{hint}</p>
      </CardContent>
    </Card>
  );
}
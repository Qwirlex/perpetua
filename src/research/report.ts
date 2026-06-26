import { config } from "../shared/config.js";
import type { MarketSnapshot, Signal } from "../shared/types.js";

// The enriched report, the higher tier product. It takes the latest signal and the
// market snapshot and returns a deeper read, a factor breakdown plus a longer written
// analysis and a confidence label. The analysis uses Gemini when configured, with a
// deterministic fallback so a paid call always returns something useful.

export interface ReportFactor {
  name: string;
  reading: string;
  weight: "low" | "medium" | "high";
}

export interface Report {
  id: string;
  ts: number;
  asset: string;
  price: number;
  score: number;
  trend: string;
  anomaly: boolean;
  confidence: "low" | "medium" | "high";
  factors: ReportFactor[];
  analysis: string;
}

function factors(s: MarketSnapshot): ReportFactor[] {
  const move = Math.abs(s.changePct24h);
  return [
    {
      name: "Price move 24h",
      reading: `${s.changePct24h} percent`,
      weight: move > 6 ? "high" : move > 2 ? "medium" : "low",
    },
    {
      name: "Volume",
      reading: `${Math.round(s.volumeUsd / 1e6)} million USD`,
      weight: s.volumeUsd > 2e10 ? "high" : s.volumeUsd > 8e9 ? "medium" : "low",
    },
    {
      name: "Network gas",
      reading: `${s.gasGwei} gwei`,
      weight: s.gasGwei > 40 ? "high" : s.gasGwei > 15 ? "medium" : "low",
    },
  ];
}

function confidenceOf(s: MarketSnapshot): "low" | "medium" | "high" {
  // More volume and a clearer move mean we trust the read more.
  if (s.volumeUsd > 1.5e10 && Math.abs(s.changePct24h) > 1) return "high";
  if (s.volumeUsd > 6e9) return "medium";
  return "low";
}

function fallbackAnalysis(signal: Signal, s: MarketSnapshot, f: ReportFactor[]): string {
  const dir = signal.trend === "up" ? "rising" : signal.trend === "down" ? "falling" : "holding flat";
  const level = signal.score <= 33 ? "low" : signal.score <= 66 ? "moderate" : "high";
  const drivers = f.filter((x) => x.weight === "high").map((x) => x.name.toLowerCase());
  const driverLine = drivers.length
    ? `The main driver right now is ${drivers.join(" and ")}.`
    : "No single factor dominates the picture right now.";
  return (
    `${signal.asset} is ${dir} near ${signal.price} with a risk score of ${signal.score} out of 100, which is ${level}. ` +
    `${driverLine} ` +
    `Volume sits around ${Math.round(s.volumeUsd / 1e6)} million USD and gas is ${s.gasGwei} gwei. ` +
    `${signal.anomaly ? "An on chain anomaly is flagged, treat sharp moves with extra caution. " : ""}` +
    `For a trader this reads as a ${level} risk setup, size positions to match.`
  );
}

async function geminiAnalysis(signal: Signal, s: MarketSnapshot, f: ReportFactor[]): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    vertexai: true,
    project: config.googleProject,
    location: config.geminiLocation,
  });
  const prompt =
    "Write a short clear market risk note for a crypto trader, three or four sentences. " +
    "No dashes, no parentheses, no jargon. State the risk, the main driver, and what to watch.\n" +
    `Asset ${signal.asset}, price ${signal.price}, 24h move ${s.changePct24h} percent, ` +
    `volume ${Math.round(s.volumeUsd / 1e6)} million USD, gas ${s.gasGwei} gwei. ` +
    `Computed risk score ${signal.score} out of 100, trend ${signal.trend}` +
    `${signal.anomaly ? ", on chain anomaly detected" : ""}. ` +
    `Key factors ${f.map((x) => `${x.name} ${x.weight}`).join(", ")}.`;
  const r = await ai.models.generateContent({ model: config.geminiModel, contents: prompt });
  return (r.text ?? "").trim();
}

export async function buildReport(signal: Signal, snapshot: MarketSnapshot): Promise<Report> {
  const f = factors(snapshot);
  let analysis = fallbackAnalysis(signal, snapshot, f);
  if (config.llmProvider === "gemini" && config.googleProject) {
    try {
      const text = await geminiAnalysis(signal, snapshot, f);
      if (text) analysis = text;
    } catch {
      // keep the fallback
    }
  }
  return {
    id: `report-${signal.id}`,
    ts: signal.ts,
    asset: signal.asset,
    price: signal.price,
    score: signal.score,
    trend: signal.trend,
    anomaly: signal.anomaly,
    confidence: confidenceOf(snapshot),
    factors: f,
    analysis,
  };
}

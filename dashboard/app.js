// Perpetua dashboard. Polls the agent API and renders the treasury, the balance over
// time chart, the signal feed, and the ledger. Plain language, no model flavored text.
// All rendering uses safe DOM nodes, never innerHTML, since the signal rationale can
// come from an LLM.
const API = (typeof window !== "undefined" && window.PERPETUA_API) || "";
const $ = (id) => document.getElementById(id);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}
function usdc(micro) {
  const v = Number(BigInt(micro)) / 1e6;
  return v.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
function fmtTs(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

let chart;
function ensureChart() {
  if (chart) return chart;
  const ctx = $("chart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Treasury balance, USDC",
          data: [],
          borderColor: "#6ea8fe",
          backgroundColor: "rgba(110,168,254,0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b98a9", maxTicksLimit: 8 }, grid: { color: "#1f2937" } },
        y: { ticks: { color: "#8b98a9" }, grid: { color: "#1f2937" }, beginAtZero: true },
      },
    },
  });
  return chart;
}

async function refreshState() {
  try {
    const s = await (await fetch(`${API}/state`)).json();
    $("balance").textContent = usdc(s.balance);
    $("earned").textContent = usdc(s.earned);
    $("spent").textContent = usdc(s.spent);
    const net = BigInt(s.earned) - BigInt(s.spent);
    const netEl = $("net");
    netEl.textContent = (net < 0n ? "-" : "") + usdc(net < 0n ? -net : net);
    netEl.className = "big " + (net >= 0n ? "up" : "down");
    $("mode").textContent = s.live ? "live, Base settlement" : "demo, local settlement";

    const c = ensureChart();
    c.data.labels = s.series.map((p) => fmtTs(p.ts));
    c.data.datasets[0].data = s.series.map((p) => Number(BigInt(p.balance)) / 1e6);
    c.update("none");
  } catch (e) {
    console.warn("state", e);
  }
}

function signalCard(s) {
  const card = el("div", "sig");
  const head = el("div", "sig-head");
  head.appendChild(el("span", "sig-asset", `${s.asset}  $${s.price.toLocaleString("en-US")}`));
  head.appendChild(el("span", "badge " + s.trend, s.trend));
  card.appendChild(head);
  card.appendChild(el("div", "sig-reason", s.rationale));
  card.appendChild(
    el(
      "div",
      "sig-meta",
      `risk score ${s.score} / 100${s.anomaly ? "  ·  on chain anomaly" : ""}  ·  ${fmtTs(s.ts)}`,
    ),
  );
  return card;
}

async function refreshFeed() {
  try {
    const cycles = await (await fetch(`${API}/cycles`)).json();
    const sigs = cycles.filter((c) => c.signal).map((c) => c.signal).reverse().slice(0, 30);
    const feed = $("feed");
    feed.textContent = "";
    sigs.forEach((s) => feed.appendChild(signalCard(s)));
  } catch (e) {
    console.warn("feed", e);
  }
}

function ledgerRow(e) {
  const sale = e.kind === "signal_sale";
  const seed = e.kind === "seed";
  const label = seed ? "Seed capital" : sale ? "Signal sale" : "Research spend";
  const cls = sale || seed ? "up" : "down";
  const sign = e.amount.startsWith("-") ? "" : "+";
  const who = e.payer ? `buyer ${e.payer.slice(0, 6)}…` : "compute";

  const row = el("div", "row");
  const left = el("div");
  left.appendChild(el("div", undefined, label));
  left.appendChild(el("div", "mono", `${who}  ·  ${e.mirrorTx || ""}`));
  row.appendChild(left);
  row.appendChild(el("div", "amt " + cls, `${sign}${usdc(e.amount.replace("-", ""))}`));
  return row;
}

async function refreshLedger() {
  try {
    const rows = await (await fetch(`${API}/ledger`)).json();
    const box = $("ledger");
    box.textContent = "";
    rows
      .slice()
      .reverse()
      .slice(0, 40)
      .forEach((e) => box.appendChild(ledgerRow(e)));
  } catch (e) {
    console.warn("ledger", e);
  }
}

function tick() {
  refreshState();
  refreshFeed();
  refreshLedger();
}
tick();
setInterval(tick, 3000);

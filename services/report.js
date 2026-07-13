'use strict';

// services/report.js
// Server-side "CFO report" PDF. Gathers the user's real numbers (Maal Score,
// net worth, assets/debts, retirement projection) and renders a one-page PDF
// with pdf-lib. Returns { filename, base64 } for the React report page to
// download. All figures come from already-tested pure functions; buildActionPlan
// is pure and unit-tested.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { getProfileByUserId, deriveAge } = require('../db/profiles');
const assetsDb = require('../db/assets');
const { computeMaalScore } = require('../lib/maal-score');
const { snapshotValuesFromProfile } = require('../db/snapshots');
const { superProjection } = require('../lib/calc');
const { findUserById } = require('../db/users');

const AUD = (n) => '$' + (Number(n) || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 });

// pdf-lib's StandardFonts are WinAnsi-encoded — replace common non-ASCII glyphs
// so encoding never throws on user/AI text. Rather than DROP the maths/analysis
// glyphs (which would silently mangle "−5%" or "≈"), map them to faithful ASCII
// so the meaning survives — Silvia renders these as "?", being correct is a cheap
// polish win (specs/silvia-parity-tier1-2.md §8).
function sanitize(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/−/g, '-')   // minus sign − → hyphen-minus
    .replace(/≈/g, '~')   // ≈ → ~
    .replace(/√/g, 'sqrt')// √ → sqrt
    .replace(/×/g, 'x')   // × → x
    .replace(/÷/g, '/')   // ÷ → /
    .replace(/±/g, '+/-') // ± → +/-
    .replace(/≤/g, '<=')  // ≤
    .replace(/≥/g, '>=')  // ≥
    .replace(/[•·]/g, '-')
    .replace(/[→⇒]/g, '->')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F]/g, '');
}

// Greedy word-wrap for a StandardFont at a given size and max width (points).
function wrapText(text, font, size, maxWidth) {
  const out = [];
  for (const para of sanitize(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(/\s+/)) {
      const trial = cur ? cur + ' ' + word : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
        out.push(cur);
        cur = word;
      } else {
        cur = trial;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Pure: a 5-step, education-only action plan from the weakest Maal Score pillars.
function buildActionPlan(maal) {
  const pillars = (maal && Array.isArray(maal.pillars)) ? maal.pillars : [];
  const tips = {
    savings: 'Build your cash buffer toward 3-6 months of expenses to see your safety margin.',
    debt: 'Review your highest-interest debts first to understand the cost of carrying them.',
    super: 'Compare your super to the ASFA comfortable benchmark and learn how contributions compound.',
    wealth: 'Track your net worth over time against age-based benchmarks to see your trajectory.',
    protection: 'Check whether your insurance and estate basics match your responsibilities.',
  };
  const weakest = [...pillars].sort((a, b) => (a.score || 0) - (b.score || 0)).slice(0, 3);
  const plan = weakest.map((p) => tips[p.key] || `Focus on improving your ${p.label}.`);
  // Pad the first three with generic education steps when pillars are missing,
  // so the plan is always 5 items (the report page promises a 5-step plan).
  const generic = [
    'List every asset, debt and income source so you can see your full financial picture.',
    'Set a specific savings or debt-reduction goal and check your progress monthly.',
    'Learn how compound growth shapes your super and long-term investments.',
  ];
  for (const g of generic) { if (plan.length >= 3) break; plan.push(g); }
  plan.push('Keep your assets, debts and income up to date so your Maal Score reflects reality.');
  plan.push('This report is educational only - do your own research and consider a licensed adviser for big decisions.');
  return plan.slice(0, 5);
}

// Retirement projection for the report, or null if inputs don't allow one.
function retirementForProfile(profile) {
  const p = profile || {};
  const currentBalance = Number(p.super_balance) || 0;
  const salary = Number(p.annual_income) || 0;
  const age = deriveAge((p.onboarding_data && p.onboarding_data.age_band) || null, p);
  const retirementAge = Number(p.retirement_age) || 67;
  if (!(retirementAge > age) || age < 15 || age >= 100) return null;
  try {
    const proj = superProjection({ currentBalance, salary, age, retirementAge });
    return {
      projectedBalance: proj.projectedBalance,
      asfaTarget: proj.asfaTarget,
      gap: Math.max(0, proj.asfaTarget - proj.projectedBalance),
      retirementAge,
    };
  } catch {
    return null;
  }
}

async function generateFinancialReport(userId) {
  const [user, rawProfile, assetSummary] = await Promise.all([
    findUserById(userId),
    getProfileByUserId(userId).then((p) => p || {}),
    assetsDb.getAssetSummary(userId),
  ]);
  const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
  const maal = computeMaalScore(profile);
  const snap = snapshotValuesFromProfile(profile);
  const retirement = retirementForProfile(profile);
  const actionPlan = buildActionPlan(maal);
  return renderReportPdf({ user, maal, snap, retirement, actionPlan });
}

// DB-free PDF rendering — takes the assembled model, returns { filename, base64 }.
async function renderReportPdf({ user, maal, snap, retirement, actionPlan }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); // A4
  const ink = rgb(0.055, 0.055, 0.063);
  const grey = rgb(0.42, 0.435, 0.46);
  const margin = 48;
  let y = 800;

  const line = (text, { size = 11, f = font, color = ink, gap = 6, x = margin } = {}) => {
    if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(sanitize(text), { x, y, size, font: f, color });
    y -= size + gap;
  };
  const rule = () => { y -= 4; page.drawLine({ start: { x: margin, y }, end: { x: 547, y }, thickness: 0.75, color: rgb(0.91, 0.91, 0.92) }); y -= 12; };

  line('Maal', { size: 20, f: bold });
  line('Your financial snapshot', { size: 13, color: grey, gap: 2 });
  line(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) + '  ·  ' + sanitize(user && user.email ? user.email : ''), { size: 9, color: grey });
  rule();

  line('MAAL SCORE', { size: 10, f: bold, color: grey, gap: 4 });
  line(`${maal.score} / 100   ${maal.band || ''}`, { size: 22, f: bold, gap: 8 });
  for (const p of (maal.pillars || [])) {
    line(`${p.label}: ${p.score}/100  (${Math.round((p.weight || 0) * 100)}% weight)`, { size: 10, color: grey, gap: 3 });
  }
  rule();

  line('NET WORTH', { size: 10, f: bold, color: grey, gap: 4 });
  line(AUD(snap.netWorth), { size: 18, f: bold, gap: 8 });
  line(`Assets ${AUD(snap.assetsTotal)}   -   Debts ${AUD(snap.debtsTotal)}`, { size: 10, color: grey, gap: 4 });
  line(`Cash ${AUD(snap.cashBalance)}    Investments ${AUD(snap.investBalance)}    Super ${AUD(snap.superBalance)}`, { size: 10, color: grey });
  rule();

  line('RETIREMENT OUTLOOK', { size: 10, f: bold, color: grey, gap: 4 });
  if (retirement) {
    line(`Projected super at ${retirement.retirementAge}: ${AUD(retirement.projectedBalance)}`, { size: 12, gap: 3 });
    line(`ASFA comfortable target: ${AUD(retirement.asfaTarget)}`, { size: 10, color: grey, gap: 3 });
    line(retirement.gap > 0 ? `Projected gap: ${AUD(retirement.gap)}` : 'On track for the ASFA comfortable benchmark.', { size: 10, color: grey });
  } else {
    line('Add your age, income and super balance to see a retirement projection.', { size: 10, color: grey });
  }
  rule();

  line('YOUR 5-STEP ACTION PLAN', { size: 10, f: bold, color: grey, gap: 6 });
  actionPlan.forEach((step, i) => line(`${i + 1}. ${step}`, { size: 10, gap: 5 }));
  rule();

  line('Maal does not provide financial advice. Information is for educational purposes only.', { size: 8, color: grey, gap: 2 });
  line('You should do your own research. Investing is risky and you can lose all of your money.', { size: 8, color: grey });

  const bytes = await pdf.save();
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `maal-report-${stamp}.pdf`, base64: Buffer.from(bytes).toString('base64') };
}

// ─── Deep research report PDF (PR 8) ───────────────────────────────────────
// Branded, multi-page: cover, running footer with page numbers, the written
// sections, a quant table, an insight-titled Monte-Carlo chart, a methodology
// appendix and the disclaimer. DB-free — the caller supplies the assembled body
// + quant. Returns { filename, base64 }.
const PCT = (n) => (n == null ? 'n/a' : (n * 100).toFixed(1) + '%');

async function renderResearchPdf({ user, question, body, quant, sources }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.055, 0.055, 0.063);
  const grey = rgb(0.42, 0.435, 0.46);
  const mint = rgb(0.07, 0.71, 0.65);
  const hair = rgb(0.91, 0.91, 0.92);
  const W = 595, H = 842, margin = 48, right = W - margin, textW = right - margin;

  let page = pdf.addPage([W, H]);
  let y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 64; };
  const need = (h) => { if (y - h < 70) newPage(); };

  // Running top accent bar (Maal signature) on every page is added at the end.
  y = H - 64;

  const para = (text, { size = 10.5, f = font, color = ink, gap = 5, lead = 4, x = margin, maxWidth = textW } = {}) => {
    for (const ln of wrapText(text, f, size, maxWidth)) {
      need(size + lead);
      if (ln) page.drawText(ln, { x, y, size, font: f, color });
      y -= size + lead;
    }
    y -= gap;
  };
  const rule = () => { need(16); y -= 4; page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: hair }); y -= 12; };

  // COVER
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: mint });
  para('Maal Research', { size: 22, f: bold, gap: 2 });
  para('Education-only research report', { size: 11, color: grey, gap: 10 });
  para(sanitize(question), { size: 16, f: bold, gap: 6, lead: 6 });
  para(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    + '  -  ' + sanitize(user && user.email ? user.email : ''), { size: 9, color: grey, gap: 8 });
  rule();

  // SUMMARY
  if (body && body.summary) {
    para('SUMMARY', { size: 10, f: bold, color: grey, gap: 4 });
    para(body.summary, { size: 11, gap: 10 });
  }

  // SECTIONS
  for (const sec of (body && body.sections) || []) {
    need(30);
    para(sanitize(sec.heading || 'Section'), { size: 13, f: bold, gap: 4 });
    if (sec.body) para(sec.body, { size: 10.5, gap: 10 });
  }

  // QUANT TABLE + CHART
  if (quant && quant.hasData && Array.isArray(quant.perSymbol) && quant.perSymbol.length) {
    rule();
    para('QUANTITATIVE SNAPSHOT', { size: 10, f: bold, color: grey, gap: 6 });

    // Table header
    const cols = [margin, margin + 70, margin + 150, margin + 220, margin + 300, margin + 400];
    const headers = ['Symbol', 'Last', '1y return', 'Volatility', 'Beta', 'Max drawdown'];
    need(20);
    headers.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8.5, font: bold, color: grey }));
    y -= 14;
    for (const s of quant.perSymbol) {
      need(16);
      const row = [
        s.symbol,
        '$' + s.lastPrice,
        PCT(s.annualizedReturn),
        PCT(s.annualizedVol),
        s.beta == null ? 'n/a' : String(s.beta),
        PCT(s.maxDrawdown),
      ];
      row.forEach((c, i) => page.drawText(sanitize(c), { x: cols[i], y, size: 9.5, font, color: ink }));
      y -= 14;
    }
    y -= 8;

    // Insight-titled Monte-Carlo chart for the first symbol (bars: p5/p50/p95).
    const s0 = quant.perSymbol[0];
    const mc = s0.monteCarlo && s0.monteCarlo.terminal;
    if (mc) {
      need(120);
      para(`Where $10,000 in ${s0.symbol} could land in a year`, { size: 11, f: bold, gap: 6 });
      const bars = [
        { label: 'Unlucky (p5)', v: mc.p5 },
        { label: 'Median (p50)', v: mc.p50 },
        { label: 'Lucky (p95)', v: mc.p95 },
      ];
      const maxV = Math.max(...bars.map((b) => b.v), 1);
      const chartX = margin + 120, chartW = 300, rowH = 22;
      bars.forEach((b, i) => {
        const by = y - i * rowH;
        const w = Math.max(2, (b.v / maxV) * chartW);
        page.drawText(b.label, { x: margin, y: by - 8, size: 8.5, font, color: grey });
        page.drawRectangle({ x: chartX, y: by - 12, width: w, height: 11, color: i === 1 ? mint : rgb(0.8, 0.83, 0.85) });
        page.drawText('$' + Math.round(b.v).toLocaleString('en-AU'), { x: chartX + w + 6, y: by - 8, size: 8.5, font: bold, color: ink });
      });
      y -= bars.length * rowH + 8;
      para('Seeded Monte-Carlo simulation (' + (s0.monteCarlo.sims) + ' paths) of geometric Brownian motion using the symbol\'s own 1-year return and volatility. Illustrative, not a forecast.', { size: 8, color: grey, gap: 8 });
    }
  }

  // METHODOLOGY APPENDIX
  rule();
  para('METHODOLOGY', { size: 10, f: bold, color: grey, gap: 4 });
  para('Prices and fundamentals from Finnhub and Financial Datasets; web evidence via Exa. '
    + 'Volatility is the sample standard deviation of daily returns annualised by sqrt(252). '
    + 'Beta = covariance(asset, market) / variance(market) against an S&P 500 proxy. '
    + 'Max drawdown is the worst peak-to-trough decline over the window. '
    + '95% VaR is the empirical 5th percentile of daily returns. '
    + 'Monte-Carlo paths use a seeded generator so results are reproducible. '
    + 'Figures are point-in-time and may be stale.', { size: 8.5, color: grey, gap: 8 });

  // SOURCES appendix (URLs only — kept out of the body per user directive, but a
  // research PDF should be auditable).
  if (Array.isArray(sources) && sources.length) {
    para('SOURCES', { size: 10, f: bold, color: grey, gap: 4 });
    sources.slice(0, 12).forEach((s) => para('- ' + (s.title || s.url) + '  (' + (s.source || '') + ')', { size: 8, color: grey, gap: 1, lead: 3 }));
    y -= 6;
  }

  // DISCLAIMER
  rule();
  para('Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. '
    + 'You should do your own research. Investing is risky and you can lose all of your money.', { size: 8, color: grey });

  // Running footer with page numbers on every page.
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: margin, y: 50 }, end: { x: right, y: 50 }, thickness: 0.5, color: hair });
    pg.drawText('Maal Research  -  education only', { x: margin, y: 38, size: 7.5, font, color: grey });
    const label = `Page ${i + 1} of ${pages.length}`;
    pg.drawText(label, { x: right - font.widthOfTextAtSize(label, 7.5), y: 38, size: 7.5, font, color: grey });
  });

  const bytes = await pdf.save();
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `maal-research-${stamp}.pdf`, base64: Buffer.from(bytes).toString('base64') };
}

// Convenience loader: assemble a research PDF for a stored report the user owns.
async function generateResearchPdf(userId, reportId) {
  const researchDb = require('../db/research');
  const report = await researchDb.getReport(reportId, userId); // ownership-scoped
  if (!report) return null;
  const body = researchDb.researchBodyFromReport(report.question, report.report, report.sources);
  const quant = await researchDb.getJobQuantByReport(userId, reportId);
  const user = await findUserById(userId);
  let sources = [];
  try { sources = typeof report.sources === 'string' ? JSON.parse(report.sources) : (report.sources || []); } catch { sources = []; }
  return renderResearchPdf({ user, question: report.question, body, quant, sources });
}

module.exports = {
  generateFinancialReport, renderReportPdf, buildActionPlan,
  renderResearchPdf, generateResearchPdf, sanitize, wrapText,
};

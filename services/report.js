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
// so encoding never throws on user/AI text.
function sanitize(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F]/g, '');
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

module.exports = { generateFinancialReport, renderReportPdf, buildActionPlan };

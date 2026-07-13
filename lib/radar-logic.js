// lib/radar-logic.js — PURE radar helpers (PR 9). No I/O, no Date.now().
//
//  - computeRadarReadiness(profile): how ready the user's data is for accurate,
//    personalised radar triggers (drives the client's readiness checklist).
//  - isRadarDue(radar, now): scheduling — should this radar fire on this sweep,
//    given its frequency + local send time + (for weekly) day of week.
//
// Both are deterministic-tested (test/radar-logic.test.js). Scheduling uses a
// fixed AEST offset (UTC+10) rather than full IANA/DST resolution — a documented
// MVP simplification; the app is AU-focused and the sweep is hourly, so an at-
// most-one-hour DST drift twice a year is acceptable and keeps this pure.

const AEST_OFFSET_MIN = 10 * 60; // UTC+10

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ─── Readiness ─────────────────────────────────────────────────────────────
// Each check contributes equally; missing ones are returned so the UI can nudge.
const READINESS_CHECKS = [
  { key: 'income', label: 'Add your income', test: (p) => num(p.annual_income) > 0 },
  { key: 'super', label: 'Add your super balance', test: (p) => num(p.super_balance) > 0 },
  { key: 'investments', label: 'Add your investments', test: (p) => num(p.investment_portfolio) > 0 || num(p.investments) > 0 },
  { key: 'cash', label: 'Add your cash & expenses', test: (p) => num(p.cash_savings) > 0 && num(p.monthly_expenses) > 0 },
  { key: 'debt', label: 'Add your debts (or confirm none)', test: (p) => num(p.total_debt) > 0 || num(p.hecs_balance) > 0 || p.no_debt === true },
];

function computeRadarReadiness(profile) {
  const p = profile || {};
  const missing = [];
  let met = 0;
  for (const c of READINESS_CHECKS) {
    if (c.test(p)) met++;
    else missing.push({ key: c.key, label: c.label });
  }
  const score = Math.round((met / READINESS_CHECKS.length) * 100);
  return { score, missing, ready: missing.length === 0 };
}

// ─── Scheduling ────────────────────────────────────────────────────────────
// Local (AEST) calendar parts for a UTC instant.
function aestParts(dateLike) {
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return null;
  const shifted = new Date(t + AEST_OFFSET_MIN * 60000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),      // 0-11
    d: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),      // 0=Sun..6=Sat
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

// Minutes-since-midnight from an 'HH:MM' string, defaulting to 09:00.
function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return 9 * 60;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
const sameMonth = (a, b) => a.y === b.y && a.m === b.m;

// isRadarDue(radar, now) — should the sweep run this radar right now?
// radar: { active, frequency, time_aest, schedule_day, last_run_at }
// Rules (all evaluated in AEST):
//   - inactive → never.
//   - not before the local send time on the target day.
//   - daily: once per calendar day.
//   - weekly: on schedule_day (if set) once per calendar day, and not within 6
//     days of the last run; if schedule_day unset, once every 7 days.
//   - monthly: once per calendar month.
function isRadarDue(radar, now) {
  const r = radar || {};
  if (r.active === false) return false;

  const nowP = aestParts(now);
  if (!nowP) return false;
  const sendMin = parseHHMM(r.time_aest);
  if (nowP.minutes < sendMin) return false; // too early in the day

  const lastP = r.last_run_at ? aestParts(r.last_run_at) : null;
  const freq = r.frequency || 'daily';

  if (freq === 'daily') {
    return !lastP || !sameDay(lastP, nowP);
  }

  if (freq === 'weekly') {
    const day = r.schedule_day;
    if (day != null && Number(day) >= 0 && Number(day) <= 6) {
      if (nowP.dow !== Number(day)) return false;
      return !lastP || !sameDay(lastP, nowP);
    }
    // No fixed day → weekly cadence: at least 7 days since last run.
    if (!lastP) return true;
    const days = (Date.UTC(nowP.y, nowP.m, nowP.d) - Date.UTC(lastP.y, lastP.m, lastP.d)) / 86400000;
    return days >= 7;
  }

  if (freq === 'monthly') {
    return !lastP || !sameMonth(lastP, nowP);
  }

  return false;
}

module.exports = {
  computeRadarReadiness, isRadarDue,
  parseHHMM, aestParts, READINESS_CHECKS,
};

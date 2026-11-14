'use strict';
// lib/weekly-recap.js — PURE builder for the Home "Your weekly recap" story.
//
// No I/O. Takes the user's own rows (net_worth_snapshots, transactions joined
// with transaction_categories, live goals) and turns them into the numbers and
// plain-English sentences the recap slides render. Every figure is derived from
// the input rows — nothing is estimated or invented. Copy is deterministic
// (no model call), so the same data always produces the same recap.
// Deterministic-tested in test/weekly-recap.test.js.

const { autoCategorize } = require('./transaction-categories');

const DAY_MS = 86400000;
const RECAP_TZ = 'Australia/Sydney';

// Groups that move money between the user's own accounts or into savings —
// they are not "spending" and are excluded from the spending + cash-flow maths.
const NON_SPEND_GROUPS = new Set(['Transfers', 'Credit Card Payments', 'Savings & Investments']);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }

// YYYY-MM-DD for `date` as seen in `tz`.
function isoDateInTz(date, tz = RECAP_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Normalise a pg DATE / Date / string to YYYY-MM-DD (UTC calendar date as stored).
function toIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

// The most recently COMPLETED Monday–Sunday week in Sydney time.
// → { start: 'YYYY-MM-DD' (Mon), end: 'YYYY-MM-DD' (Sun), prevStart, prevEnd }
function recapWindow(now = new Date(), tz = RECAP_TZ) {
  const today = isoDateInTz(now, tz);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay(); // 0 Sun … 6 Sat
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(today, -daysSinceMonday);
  const start = addDays(thisMonday, -7);
  const end = addDays(thisMonday, -1);
  return { start, end, prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "10–16 November" / "27 October – 2 November" (Australian day-first order).
function formatRange(start, end) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  }
  return `${a.getUTCDate()} ${MONTHS_SHORT[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`;
}

// "10th to 16th November" for the Home card subtitle.
function formatRangeLong(start, end) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${ordinal(a.getUTCDate())} to ${ordinal(b.getUTCDate())} ${MONTHS[b.getUTCMonth()]}`;
  }
  return `${ordinal(a.getUTCDate())} ${MONTHS[a.getUTCMonth()]} to ${ordinal(b.getUTCDate())} ${MONTHS[b.getUTCMonth()]}`;
}

function aud(n, { signed = false } = {}) {
  const v = round2(n);
  const abs = Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
  const sign = v < 0 ? '-' : (signed && v > 0 ? '+' : '');
  return `${sign}$${abs}`;
}

function pct(n) {
  return `${Math.abs(round2(n)).toFixed(1)}%`;
}

// ─── Net worth ─────────────────────────────────────────────────────────────
// snapshots: [{ snap_date, net_worth }] (any order). Opening = latest snapshot
// on/before the day before the window (falls back to the first one inside it);
// closing = latest snapshot on/before the window end.
function buildNetWorth(snapshots, win) {
  const rows = (Array.isArray(snapshots) ? snapshots : [])
    .map((r) => ({ date: toIso(r && r.snap_date), value: num(r && r.net_worth) }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const openingDay = addDays(win.start, -1);
  const before = rows.filter((r) => r.date <= openingDay);
  const inside = rows.filter((r) => r.date >= win.start && r.date <= win.end);
  const opening = before.length ? before[before.length - 1] : (inside[0] || null);
  const closingRows = rows.filter((r) => r.date <= win.end);
  const closing = closingRows.length ? closingRows[closingRows.length - 1] : null;

  if (!opening || !closing || closing.date < win.start) {
    return { hasData: false, opening: null, closing: null, change: null, changePct: null, direction: 'flat', series: [] };
  }

  const series = [];
  if (opening.date < win.start) series.push(opening);
  for (const r of inside) series.push(r);

  const change = round2(closing.value - opening.value);
  const changePct = opening.value === 0 ? null : round2((change / Math.abs(opening.value)) * 100);
  const direction = Math.abs(change) < 0.005 ? 'flat' : (change > 0 ? 'up' : 'down');
  return {
    hasData: true,
    opening: round2(opening.value),
    closing: round2(closing.value),
    change,
    changePct,
    direction,
    series: series.map((r) => ({ date: r.date, value: round2(r.value) })),
  };
}

// ─── Transactions ──────────────────────────────────────────────────────────
// Effective category group: the stored one, else the keyword auto-categoriser.
function groupOf(t) {
  if (t && t.category_group) return String(t.category_group);
  const auto = autoCategorize(t && t.description, t && t.amount);
  return auto ? auto.group : 'Other';
}

function inWindow(t, start, end) {
  const d = toIso(t && t.post_date);
  return !!d && d >= start && d <= end;
}

// Spending (outflows, excluding transfers/savings) + income (inflows,
// excluding transfers) over [start, end].
function summariseFlows(transactions, start, end) {
  let spent = 0;
  let income = 0;
  let count = 0;
  const byGroup = new Map();
  let largest = null;
  for (const t of transactions) {
    if (!inWindow(t, start, end)) continue;
    const amount = num(t.amount);
    if (amount === 0) continue;
    const group = groupOf(t);
    if (NON_SPEND_GROUPS.has(group)) continue;
    if (amount < 0) {
      const out = -amount;
      spent += out;
      count++;
      byGroup.set(group, (byGroup.get(group) || 0) + out);
      if (!largest || out > largest.amount) {
        largest = { amount: round2(out), description: String(t.description || '').slice(0, 80), group, date: toIso(t.post_date) };
      }
    } else {
      income += amount;
    }
  }
  const total = spent;
  const categories = [...byGroup.entries()]
    .map(([group, amount]) => ({ group, amount: round2(amount), share: total > 0 ? round2((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount || a.group.localeCompare(b.group));
  return { spent: round2(spent), income: round2(income), count, categories, largest };
}

// ─── Goals ─────────────────────────────────────────────────────────────────
function buildGoals(goals) {
  const list = (Array.isArray(goals) ? goals : []).map((g) => ({
    name: String(g.name || 'Goal').slice(0, 80),
    target: round2(g.target_amount),
    current: round2(g.current_amount),
    progressPct: Math.max(0, Math.min(100, round2(g.progress_pct))),
    reached: !!g.reached,
    targetDate: toIso(g.target_date),
  }));
  list.sort((a, b) => Number(b.reached) - Number(a.reached) || b.progressPct - a.progressPct);
  return { hasData: list.length > 0, count: list.length, reached: list.filter((g) => g.reached).length, items: list.slice(0, 4) };
}

// ─── Copy ──────────────────────────────────────────────────────────────────
function netWorthCopy(nw) {
  if (!nw.hasData) {
    return {
      title: 'Your net worth story starts here',
      body: [
        'Maal records a net worth snapshot each day you visit. Once a full week of snapshots is in, this slide shows how it moved.',
        'Add your accounts, assets and debts so the picture is complete.',
      ],
    };
  }
  if (nw.direction === 'flat') {
    return {
      title: 'Your net worth held steady through a quiet week',
      body: [
        `Your net worth finished the week at ${aud(nw.closing)}, unchanged from where it started.`,
        'No movement in your recorded balances, assets or debts changed the total this week.',
      ],
    };
  }
  const verb = nw.direction === 'up' ? 'rose' : 'fell';
  const pctText = nw.changePct == null ? '' : ` (${pct(nw.changePct)})`;
  return {
    title: nw.direction === 'up' ? 'Your net worth moved up this week' : 'Your net worth dipped this week',
    body: [
      `Your net worth ${verb} ${aud(Math.abs(nw.change))}${pctText}, from ${aud(nw.opening)} to ${aud(nw.closing)}.`,
      nw.direction === 'up'
        ? 'Changes in your balances, investments or debts lifted the total over the seven days.'
        : 'Changes in your balances, investments or debts pulled the total lower over the seven days. Short-term moves are normal, especially with market-linked assets.',
    ],
  };
}

function spendingCopy(cur, prev) {
  if (!cur.count) {
    return {
      title: 'No spending recorded this week',
      body: ['Maal didn’t find any outgoing transactions for these seven days.', 'Connect a bank account or upload a statement to see where your money goes.'],
    };
  }
  const top = cur.categories[0];
  const lines = [`You spent ${aud(cur.spent)} across ${cur.count} transaction${cur.count === 1 ? '' : 's'}. ${top.group} was your biggest category at ${aud(top.amount)} (${Math.round(top.share)}% of spending).`];
  if (prev && prev.spent > 0) {
    const diff = round2(cur.spent - prev.spent);
    const diffPct = round2((diff / prev.spent) * 100);
    if (Math.abs(diff) < 0.005) lines.push('That’s the same as the week before.');
    else lines.push(`That’s ${aud(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the week before (${diff > 0 ? 'up' : 'down'} ${pct(diffPct)}).`);
  } else {
    lines.push('There’s no spending recorded for the week before to compare against yet.');
  }
  const title = prev && prev.spent > 0
    ? (cur.spent > prev.spent ? `Spending was up, led by ${top.group.toLowerCase()}` : `Spending eased, with ${top.group.toLowerCase()} on top`)
    : `${top.group} led your spending this week`;
  return { title, body: lines };
}

function cashFlowCopy(cur) {
  if (!cur.count && cur.income <= 0) {
    return { title: 'No money in or out recorded', body: ['Once transactions are connected, this shows what came in against what went out each week.'] };
  }
  const net = round2(cur.income - cur.spent);
  const body = [`${aud(cur.income)} came in and ${aud(cur.spent)} went out on spending, leaving you ${net >= 0 ? 'ahead by' : 'behind by'} ${aud(Math.abs(net))} for the week.`];
  body.push(cur.income > 0
    ? `That’s ${Math.round((cur.spent / cur.income) * 100)}% of this week’s income spent. Transfers between your own accounts and money moved into savings or investments aren’t counted as spending.`
    : 'No income was recorded this week, which is common if you’re paid fortnightly or monthly.');
  return { title: net >= 0 ? 'You kept more than you spent' : 'You spent more than came in', body };
}

function goalsCopy(goals) {
  if (!goals.hasData) {
    return { title: 'Set a goal to track here', body: ['Goals linked to your net worth, cash, super or debts update automatically as your numbers change.'] };
  }
  const lead = goals.items[0];
  const body = [goals.reached
    ? `You’ve reached ${goals.reached} of your ${goals.count} goal${goals.count === 1 ? '' : 's'}.`
    : `You’re tracking ${goals.count} goal${goals.count === 1 ? '' : 's'}. ${lead.name} is furthest along at ${Math.round(lead.progressPct)}%.`];
  body.push('Progress is measured from your live balances, so it moves as your accounts do.');
  return { title: goals.reached ? 'Goals reached — nice work' : 'Your goals are moving', body };
}

// buildWeeklyRecap({ now, snapshots, transactions, goals })
//   snapshots: net_worth_snapshots rows (≥ 2 weeks so the opening value exists)
//   transactions: rows { description, amount (signed; negative = outflow),
//                 post_date, category_group? } covering the window + prior week
//   goals: db/goals listGoals() rows (with derived progress)
function buildWeeklyRecap({ now = new Date(), snapshots = [], transactions = [], goals = [] } = {}) {
  const win = recapWindow(now);
  const txns = Array.isArray(transactions) ? transactions : [];
  const netWorth = buildNetWorth(snapshots, win);
  const cur = summariseFlows(txns, win.start, win.end);
  const prev = summariseFlows(txns, win.prevStart, win.prevEnd);
  const g = buildGoals(goals);

  return {
    period: { start: win.start, end: win.end, label: formatRange(win.start, win.end), longLabel: formatRangeLong(win.start, win.end) },
    netWorth: { ...netWorth, copy: netWorthCopy(netWorth) },
    spending: {
      hasData: cur.count > 0,
      total: cur.spent,
      count: cur.count,
      previousTotal: prev.spent,
      categories: cur.categories.slice(0, 5),
      largest: cur.largest,
      copy: spendingCopy(cur, prev),
    },
    cashFlow: {
      hasData: cur.count > 0 || cur.income > 0,
      moneyIn: cur.income,
      moneyOut: cur.spent,
      net: round2(cur.income - cur.spent),
      copy: cashFlowCopy(cur),
    },
    goals: { ...g, copy: goalsCopy(g) },
  };
}

module.exports = {
  buildWeeklyRecap,
  recapWindow,
  buildNetWorth,
  summariseFlows,
  buildGoals,
  formatRange,
  formatRangeLong,
  NON_SPEND_GROUPS,
};

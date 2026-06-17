// scripts/render-test.js
// Renders every EJS view with realistic mock locals to catch template crashes
// (undefined variables, bad property access) without needing a database.
// Run: node scripts/render-test.js

const ejs = require('ejs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');

const session = { userId: 1, name: 'Mahmoud Sair', email: 'test@example.com' };
const user = {
  id: 1, email: 'test@example.com', name: 'Mahmoud Sair', provider: 'credentials',
  email_verified: true, created_at: new Date(), plan: 'free', basiq_user_id: null, phone: null,
  two_factor_enabled: false,
};
const profile = {
  user_id: 1, profession: 'Doctor', specialty: 'GP', years_in_practice: 3,
  annual_income: 120000, hecs_balance: 40000, super_balance: 35000,
  investment_portfolio: 20000, property_value: 0, total_debt: 5000,
  cash_savings: 15000, monthly_expenses: 4000,
  goals: [], prefers_halal: true, prefers_esg: false, has_smsf: false,
  has_private_health: true, practice_owner: false, insurance_cover: 'partial',
  retirement_age: 65, onboarding_data: {}, completed_onboarding: true,
};
const score = {
  score_type: 'financial_health', score_value: 68, grade: 'Fair',
  score_breakdown: {}, diagnosis: 'Solid start.', action_plan: [],
  halal_compliance_score: 70, portfolio_health_score: 60, created_at: new Date(),
};
const { computeMaalScore } = require('../lib/maal-score');
const maalScore = computeMaalScore(profile);
const { estimateTax } = require('../lib/tax');

const base = { session, user, profile, pageTitle: 'Test' };

// Per-view locals mirroring what each route passes (routes/*.js)
const cases = {
  'dashboard-overview': { ...base, financialScore: score, superScore: score, ethicalScore: score, maalScore, snapshots: [], taxImpact: estimateTax(profile), connected: { count: 2, cash: 4250, super: 0, invest: 0, debt: 1200 }, recentTransactions: [{ description: 'Woolworths', amount: -84.20, post_date: new Date() }, { description: 'Salary', amount: 5400, post_date: new Date() }], movers: { top: [{ symbol: 'NVDA', price: 1203.4, percent: 4.2 }], bottom: [{ symbol: 'TSLA', price: 178.2, percent: -3.1 }] }, chartTxns: [{ post_date: new Date(), amount: 5400 }, { post_date: new Date(), amount: -84.2 }] },
  'dashboard-roadmap': { ...base, items: [
    { id: 1, title: 'Test item', details: 'Some details', status: 'planned', score: 3, upvotes: 4, downvotes: 1, my_vote: 1 },
    { id: 2, title: 'Another', details: null, status: 'open', score: 0, upvotes: 0, downvotes: 0, my_vote: null },
  ] },
  'dashboard-ask': base,
  'dashboard-research': { ...base, advisorReady: true, reports: [{ id: 1, question: 'What if the ASX drops 20%?', status: 'complete', created_at: new Date() }, { id: 2, question: 'Salary sacrifice vs mortgage?', status: 'error', created_at: new Date() }] },
  'dashboard-radar': { ...base, advisorReady: true, radars: [{ id: 1, prompt: 'Alert me if NVDA moves more than 10% in a day', frequency: 'daily', notify_email: true, notify_sms: false, last_run_at: new Date(), last_alerted: true, last_result: 'NVDA fell 11% after weak guidance.' }, { id: 2, prompt: 'Watch my spending vs budget', frequency: 'weekly', notify_email: true, notify_sms: true, last_run_at: null, last_alerted: false, last_result: null }] },
  'dashboard-assets': { ...base, basiqEnabled: true, liveAccounts: [{ institution_name: 'Hooli Bank', institution_type: 'transaction', balance: 4250 }], connected: { count: 1, cash: 4250, super: 0, invest: 0, debt: 0 } },
  'dashboard-vault': { ...base, files: [{ id: 1, filename: 'NOA-2025.pdf', mime: 'application/pdf', size_bytes: 184320, created_at: new Date() }] },
  'dashboard-transactions': { ...base, basiqEnabled: true, basiqStatus: 'error', basiqReason: 'Basiq 403 on /users', liveTransactions: [], liveAccounts: [], statementFiles: [{ id: 2, filename: 'cba-may.csv', mime: 'text/csv', size_bytes: 5120, created_at: new Date() }] },
  'dashboard-goals': { ...base, goals: [{ id: 1, name: 'Emergency fund', type: 'Save', target: 20000, current: 12000, created_at: new Date() }, { id: 2, name: 'Pay off HECS', type: 'Pay Off', target: 42000, current: 8000, created_at: new Date() }] },
  'dashboard-settings': { ...base, billingStatus: 'success', billingPlanName: 'Maal Pro ($20/mo)' },
  'dashboard-scores': { ...base, financialScore: score, superScore: score, ethicalScore: score, fhsHistory: [score], shsHistory: [], ehsHistory: [] },
  'dashboard-recommendations': { ...base, recommendations: [], filter: 'all' },
  'dashboard-accounts': { ...base, accounts: [], basiqEnabled: true },
  'dashboard-profile': { ...base, accounts: [], success: null, error: null },
  'dashboard-history': { ...base, scores: [score], recommendations: [] },
  'auth-login': { error: null, email: '' },
  'auth-signup': { error: null, email: '', name: '' },
  'auth-forgot-password': { error: null, success: null, email: '' },
  'auth-reset-password': { error: null, success: null, token: 'tok' },
  'auth-verify-otp': { email: 'test@example.com', error: null },
  'error': { message: 'Test error' },
};

async function main() {
  let failed = 0;
  for (const [view, locals] of Object.entries(cases)) {
    const file = path.join(VIEWS, view + '.ejs');
    try {
      const body = await ejs.renderFile(file, locals, { async: false });
      // Dashboard pages render inside app-layout — test the wrapper too
      if (view.startsWith('dashboard-')) {
        await ejs.renderFile(path.join(VIEWS, 'app-layout.ejs'), { ...locals, body });
      }
      console.log('  OK   ' + view);
    } catch (err) {
      if (err.code === 'ENOENT') { console.log('  SKIP ' + view + ' (no such view)'); continue; }
      failed++;
      console.error('  FAIL ' + view + ' — ' + err.message.split('\n')[0]);
    }
  }
  console.log(failed ? `\n${failed} view(s) failed` : '\nAll views rendered cleanly');
  process.exit(failed ? 1 : 0);
}

main();

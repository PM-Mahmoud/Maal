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
  user_id: 1, profession: 'Teacher', years_in_practice: 3,
  annual_income: 95000, hecs_balance: 40000, super_balance: 35000,
  investment_portfolio: 20000, property_value: 0, total_debt: 5000,
  cash_savings: 15000, monthly_expenses: 4000,
  goals: [], prefers_halal: false, prefers_esg: false, has_smsf: false,
  has_private_health: true, practice_owner: false, insurance_cover: 'partial',
  retirement_age: 65, onboarding_data: {}, completed_onboarding: true,
};
const base = { session, user, profile, pageTitle: 'Test' };

// Per-view locals mirroring what each route passes (routes/*.js).
// NOTE: the legacy EJS dashboard-*.ejs views are retired (superseded by the
// React app at /app) and intentionally no longer rendered here.
const cases = {
  'auth-login': { error: null, email: '' },
  'auth-signup': { error: null, email: '', name: '', membership: require('../lib/membership') },
  'pricing': { analyticsSnippet: '', user: null, membership: require('../lib/membership') },
  'about': { analyticsSnippet: '', user: null },
  'security': { analyticsSnippet: '', user: null },
  'financial-wellbeing-score': { analyticsSnippet: '', user: null },
  'contact': { analyticsSnippet: '', user: null, success: false, name: '', email: '', message: '' },
  'auth-forgot-password': { error: null, sent: false, email: '' },
  'auth-reset-password': { error: null, success: null, token: 'tok' },
  'auth-verify-otp': { email: 'test@example.com', error: null },
  'auth-verify-email': { success: true, error: null },
  'auth-layout': { body: '<h1>Test</h1>', title: 'Test' },
  'error': { message: 'Test error' },
  'not-found': { signedIn: false },
};

async function main() {
  let failed = 0;
  for (const [view, locals] of Object.entries(cases)) {
    const file = path.join(VIEWS, view + '.ejs');
    try {
      await ejs.renderFile(file, locals, { async: false });
      console.log('  OK   ' + view);
    } catch (err) {
      if (err.code === 'ENOENT') { console.log('  SKIP ' + view + ' (no such view)'); continue; }
      failed++;
      console.error('  FAIL ' + view + ' — ' + err.message.split('\n')[0]);
    }
  }
  // Extra states of the auth pages (each state is its own branch of the view).
  const variants = [
    ['auth-login', { error: 'Incorrect password. 2 attempts remaining before lockout.', notice: 'You’ve been logged out.', email: 'a@b.co', next: '/app/goals' }],
    ['auth-forgot-password', { error: null, sent: true, email: '' }],
    ['auth-forgot-password', { error: 'Please enter a valid email address.', sent: false, email: 'x' }],
    ['auth-reset-password', { error: 'Password must contain at least one number.', success: null, token: 'tok' }],
    ['auth-reset-password', { error: 'This reset link is invalid or has expired.', success: null, token: '' }],
    ['auth-reset-password', { error: null, success: true, token: '' }],
    ['auth-verify-otp', { email: 'test@example.com', error: 'Invalid or expired code.', purpose: 'login' }],
    ['auth-verify-otp', { email: '', error: null, purpose: 'totp', heading: 'Enter your authenticator code', subtitle: 'Open your authenticator app.', action: '/login/totp', resend: false, sms: false }],
    ['auth-verify-email', { success: false, error: null }],
    ['not-found', { signedIn: true, cspNonce: 'n0nce' }],
  ];
  for (const [view, locals] of variants) {
    try {
      await ejs.renderFile(path.join(VIEWS, view + '.ejs'), locals, { async: false });
      console.log('  OK   ' + view + ' (state)');
    } catch (err) {
      failed++;
      console.error('  FAIL ' + view + ' (state) — ' + err.message.split('\n')[0]);
    }
  }
  console.log(failed ? `\n${failed} view(s) failed` : '\nAll views rendered cleanly');
  process.exit(failed ? 1 : 0);
}

main();

'use strict';
// lib/transaction-categories.js
// The 18-group AU transaction category taxonomy (specs/silvia-parity-tier1-2.md,
// decision 6 / PR 6). Market-neutral — ports directly, with AU merchant keywords
// added for auto-categorisation. Each group has sub-categories and a keyword list
// used by autoCategorize() as a rules-free fallback.

// Each keyword carries the sub-category it implies (kw = text, c = category), so
// autoCategorize resolves e.g. "interest" → Income/Interest rather than always
// falling back to the group's first category.
const K = (kw, c) => ({ kw, c });

const TAXONOMY = [
  { group: 'Income', categories: ['Salary & wages', 'Interest', 'Dividends', 'Refunds', 'Other income'],
    keywords: [K('salary', 'Salary & wages'), K('payroll', 'Salary & wages'), K('wage', 'Salary & wages'), K('interest', 'Interest'), K('dividend', 'Dividends'), K('refund', 'Refunds'), K('centrelink', 'Other income'), K('ato refund', 'Refunds')] },
  { group: 'Credit Card Payments', categories: ['Card payment'],
    keywords: [K('card payment', 'Card payment'), K('cc payment', 'Card payment'), K('credit card', 'Card payment')] },
  { group: 'Transfers', categories: ['Internal transfer', 'External transfer', 'BPAY', 'PayID'],
    keywords: [K('to savings', 'Internal transfer'), K('from savings', 'Internal transfer'), K('bpay', 'BPAY'), K('payid', 'PayID'), K('osko', 'External transfer'), K('transfer', 'External transfer')] },
  { group: 'Financial', categories: ['Bank fees', 'Interest charged', 'Tax', 'Insurance'],
    keywords: [K('fee', 'Bank fees'), K('interest charge', 'Interest charged'), K('ato', 'Tax'), K('tax', 'Tax'), K('insurance', 'Insurance'), K('premium', 'Insurance'), K('nib', 'Insurance'), K('bupa', 'Insurance'), K('medibank', 'Insurance')] },
  { group: 'Savings & Investments', categories: ['Investment', 'Super', 'Brokerage'],
    keywords: [K('vanguard', 'Investment'), K('betashares', 'Investment'), K('commsec', 'Brokerage'), K('stake', 'Brokerage'), K('selfwealth', 'Brokerage'), K('pearler', 'Brokerage'), K('superannuation', 'Super'), K('super', 'Super')] },
  { group: 'Housing', categories: ['Rent', 'Mortgage', 'Strata', 'Council rates', 'Home maintenance'],
    keywords: [K('rent', 'Rent'), K('mortgage', 'Mortgage'), K('home loan', 'Mortgage'), K('strata', 'Strata'), K('council', 'Council rates'), K('bunnings', 'Home maintenance'), K('ikea', 'Home maintenance')] },
  { group: 'Bills & Utilities', categories: ['Electricity', 'Gas', 'Water', 'Internet', 'Mobile'],
    keywords: [K('agl', 'Electricity'), K('origin energy', 'Electricity'), K('energyaustralia', 'Electricity'), K('electric', 'Electricity'), K('gas', 'Gas'), K('water', 'Water'), K('telstra', 'Mobile'), K('optus', 'Mobile'), K('vodafone', 'Mobile'), K('tpg', 'Internet'), K('aussie broadband', 'Internet'), K('utility', 'Electricity')] },
  { group: 'Food & Dining', categories: ['Groceries', 'Restaurants', 'Cafes', 'Takeaway', 'Delivery'],
    keywords: [K('woolworths', 'Groceries'), K('coles', 'Groceries'), K('aldi', 'Groceries'), K('iga', 'Groceries'), K('costco', 'Groceries'), K('cafe', 'Cafes'), K('coffee', 'Cafes'), K('restaurant', 'Restaurants'), K('uber eats', 'Delivery'), K('ubereats', 'Delivery'), K('doordash', 'Delivery'), K('menulog', 'Delivery'), K('mcdonald', 'Takeaway'), K('kfc', 'Takeaway'), K('hungry jack', 'Takeaway')] },
  { group: 'Health & Wellness', categories: ['Pharmacy', 'Doctor', 'Dental', 'Fitness'],
    keywords: [K('chemist', 'Pharmacy'), K('pharmacy', 'Pharmacy'), K('priceline', 'Pharmacy'), K('doctor', 'Doctor'), K('medical', 'Doctor'), K('dental', 'Dental'), K('gym', 'Fitness'), K('fitness', 'Fitness'), K('anytime fitness', 'Fitness'), K('f45', 'Fitness')] },
  { group: 'Auto & Transport', categories: ['Fuel', 'Public transport', 'Rideshare', 'Parking', 'Servicing'],
    keywords: [K('bp', 'Fuel'), K('caltex', 'Fuel'), K('shell', 'Fuel'), K('ampol', 'Fuel'), K('7-eleven', 'Fuel'), K('fuel', 'Fuel'), K('opal', 'Public transport'), K('myki', 'Public transport'), K('go card', 'Public transport'), K('uber', 'Rideshare'), K('didi', 'Rideshare'), K('ola', 'Rideshare'), K('parking', 'Parking'), K('linkt', 'Parking'), K('e-toll', 'Parking'), K('rego', 'Servicing')] },
  { group: 'Shopping', categories: ['Clothing', 'Electronics', 'Homewares', 'General retail'],
    keywords: [K('amazon', 'General retail'), K('kmart', 'General retail'), K('target', 'General retail'), K('big w', 'General retail'), K('jb hi-fi', 'Electronics'), K('jbhifi', 'Electronics'), K('harvey norman', 'Electronics'), K('the iconic', 'Clothing'), K('myer', 'Clothing'), K('david jones', 'Clothing'), K('catch', 'General retail')] },
  { group: 'Travel & Lifestyle', categories: ['Flights', 'Accommodation', 'Entertainment', 'Events'],
    keywords: [K('qantas', 'Flights'), K('jetstar', 'Flights'), K('virgin', 'Flights'), K('flight', 'Flights'), K('airbnb', 'Accommodation'), K('booking.com', 'Accommodation'), K('hotel', 'Accommodation'), K('ticketek', 'Events'), K('ticketmaster', 'Events'), K('cinema', 'Entertainment'), K('hoyts', 'Entertainment'), K('event cinemas', 'Entertainment')] },
  { group: 'Education', categories: ['Tuition', 'Courses', 'Books', 'HECS'],
    keywords: [K('university', 'Tuition'), K('uni', 'Tuition'), K('tafe', 'Tuition'), K('course', 'Courses'), K('udemy', 'Courses'), K('coursera', 'Courses'), K('textbook', 'Books'), K('hecs', 'HECS'), K('help debt', 'HECS')] },
  { group: 'Children', categories: ['Childcare', 'School', 'Kids activities'],
    keywords: [K('childcare', 'Childcare'), K('daycare', 'Childcare'), K('school', 'School'), K('kindy', 'Childcare'), K('kindergarten', 'Childcare')] },
  { group: 'Recurring & Subscriptions', categories: ['Streaming', 'Software', 'Memberships'],
    keywords: [K('netflix', 'Streaming'), K('spotify', 'Streaming'), K('disney', 'Streaming'), K('stan', 'Streaming'), K('binge', 'Streaming'), K('kayo', 'Streaming'), K('amazon prime', 'Streaming'), K('youtube premium', 'Streaming'), K('apple.com/bill', 'Software'), K('icloud', 'Software'), K('google storage', 'Software'), K('adobe', 'Software'), K('microsoft', 'Software'), K('openai', 'Software'), K('chatgpt', 'Software'), K('audible', 'Memberships'), K('patreon', 'Memberships')] },
  { group: 'Business', categories: ['Business expense', 'Supplies', 'Services'],
    keywords: [K('officeworks', 'Supplies'), K('canva', 'Services'), K('xero', 'Services'), K('myob', 'Services'), K('aws', 'Services'), K('google ads', 'Services'), K('facebook ads', 'Services')] },
  { group: 'Gifts & Donations', categories: ['Gifts', 'Charity'],
    keywords: [K('donation', 'Charity'), K('oxfam', 'Charity'), K('red cross', 'Charity'), K('unicef', 'Charity'), K('gofundme', 'Charity'), K('charity', 'Charity')] },
  { group: 'Other', categories: ['Uncategorised', 'Cash', 'ATM'],
    keywords: [K('atm', 'ATM'), K('cash withdrawal', 'Cash'), K('withdrawal', 'Cash')] },
];

const GROUPS = TAXONOMY.map((t) => t.group);

function isKnownGroup(group) {
  return GROUPS.includes(group);
}

// Is `category` a valid sub-category of `group`? (used to validate rule input)
function isValidCategory(group, category) {
  const t = TAXONOMY.find((x) => x.group === group);
  return !!t && (!category || t.categories.includes(category));
}

// Rules-free keyword auto-categorisation. Returns { group, category } or null.
// Longest keyword match wins so "amazon prime" (subscription) beats "amazon"
// (shopping). Income vs expense is disambiguated by amount sign when provided.
function autoCategorize(description, amount) {
  const desc = String(description || '').toLowerCase();
  if (!desc.trim()) return null;
  let best = null;
  for (const t of TAXONOMY) {
    for (const k of t.keywords) {
      if (desc.includes(k.kw) && (!best || k.kw.length > best.kw.length)) {
        best = { group: t.group, category: k.c, kw: k.kw };
      }
    }
  }
  // A positive amount that matched a non-income expense keyword is more likely
  // income (e.g. a refund) — but only override when nothing matched at all.
  if (!best && Number(amount) > 0) return { group: 'Income', category: 'Other income' };
  return best ? { group: best.group, category: best.category } : null;
}

module.exports = { TAXONOMY, GROUPS, isKnownGroup, isValidCategory, autoCategorize };

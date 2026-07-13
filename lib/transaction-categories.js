'use strict';
// lib/transaction-categories.js
// The 18-group AU transaction category taxonomy (specs/silvia-parity-tier1-2.md,
// decision 6 / PR 6). Market-neutral — ports directly, with AU merchant keywords
// added for auto-categorisation. Each group has sub-categories and a keyword list
// used by autoCategorize() as a rules-free fallback.

const TAXONOMY = [
  { group: 'Income', categories: ['Salary & wages', 'Interest', 'Dividends', 'Refunds', 'Other income'],
    keywords: ['salary', 'payroll', 'wage', 'interest', 'dividend', 'refund', 'centrelink', 'ato refund'] },
  { group: 'Credit Card Payments', categories: ['Card payment'],
    keywords: ['card payment', 'cc payment', 'credit card'] },
  { group: 'Transfers', categories: ['Internal transfer', 'External transfer', 'BPAY', 'PayID'],
    keywords: ['transfer', 'bpay', 'payid', 'osko', 'to savings', 'from savings'] },
  { group: 'Financial', categories: ['Bank fees', 'Interest charged', 'Tax', 'Insurance'],
    keywords: ['fee', 'interest charge', 'ato', 'tax', 'insurance', 'premium', 'nib', 'bupa', 'medibank'] },
  { group: 'Savings & Investments', categories: ['Investment', 'Super', 'Brokerage'],
    keywords: ['vanguard', 'betashares', 'commsec', 'stake', 'superannuation', 'super', 'selfwealth', 'pearler'] },
  { group: 'Housing', categories: ['Rent', 'Mortgage', 'Strata', 'Council rates', 'Home maintenance'],
    keywords: ['rent', 'mortgage', 'home loan', 'strata', 'council', 'bunnings', 'ikea'] },
  { group: 'Bills & Utilities', categories: ['Electricity', 'Gas', 'Water', 'Internet', 'Mobile'],
    keywords: ['agl', 'origin energy', 'energyaustralia', 'telstra', 'optus', 'vodafone', 'tpg', 'aussie broadband', 'water', 'electric', 'utility'] },
  { group: 'Food & Dining', categories: ['Groceries', 'Restaurants', 'Cafes', 'Takeaway', 'Delivery'],
    keywords: ['woolworths', 'coles', 'aldi', 'iga', 'costco', 'cafe', 'coffee', 'restaurant', 'uber eats', 'ubereats', 'doordash', 'menulog', 'mcdonald', 'kfc', 'hungry jack'] },
  { group: 'Health & Wellness', categories: ['Pharmacy', 'Doctor', 'Dental', 'Fitness'],
    keywords: ['chemist', 'pharmacy', 'priceline', 'doctor', 'medical', 'dental', 'gym', 'fitness', 'anytime fitness', 'f45'] },
  { group: 'Auto & Transport', categories: ['Fuel', 'Public transport', 'Rideshare', 'Parking', 'Servicing'],
    keywords: ['bp', 'caltex', 'shell', 'ampol', '7-eleven', 'fuel', 'opal', 'myki', 'go card', 'uber', 'didi', 'ola', 'parking', 'linkt', 'e-toll', 'rego'] },
  { group: 'Shopping', categories: ['Clothing', 'Electronics', 'Homewares', 'General retail'],
    keywords: ['amazon', 'kmart', 'target', 'big w', 'jb hi-fi', 'jbhifi', 'harvey norman', 'the iconic', 'myer', 'david jones', 'catch'] },
  { group: 'Travel & Lifestyle', categories: ['Flights', 'Accommodation', 'Entertainment', 'Events'],
    keywords: ['qantas', 'jetstar', 'virgin', 'airbnb', 'booking.com', 'hotel', 'flight', 'ticketek', 'ticketmaster', 'cinema', 'hoyts', 'event cinemas'] },
  { group: 'Education', categories: ['Tuition', 'Courses', 'Books', 'HECS'],
    keywords: ['university', 'uni', 'tafe', 'course', 'udemy', 'coursera', 'textbook', 'hecs', 'help debt'] },
  { group: 'Children', categories: ['Childcare', 'School', 'Kids activities'],
    keywords: ['childcare', 'daycare', 'school', 'kindy', 'kindergarten'] },
  { group: 'Recurring & Subscriptions', categories: ['Streaming', 'Software', 'Memberships'],
    keywords: ['netflix', 'spotify', 'disney', 'stan', 'binge', 'kayo', 'amazon prime', 'youtube premium', 'apple.com/bill', 'icloud', 'google storage', 'adobe', 'microsoft', 'openai', 'chatgpt', 'audible', 'patreon'] },
  { group: 'Business', categories: ['Business expense', 'Supplies', 'Services'],
    keywords: ['officeworks', 'canva', 'xero', 'myob', 'aws', 'google ads', 'facebook ads'] },
  { group: 'Gifts & Donations', categories: ['Gifts', 'Charity'],
    keywords: ['donation', 'oxfam', 'red cross', 'unicef', 'gofundme', 'charity'] },
  { group: 'Other', categories: ['Uncategorised', 'Cash', 'ATM'],
    keywords: ['atm', 'cash withdrawal', 'withdrawal'] },
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
    for (const kw of t.keywords) {
      if (desc.includes(kw) && (!best || kw.length > best.kw.length)) {
        best = { group: t.group, category: t.categories[0], kw };
      }
    }
  }
  // A positive amount that matched a non-income expense keyword is more likely
  // income (e.g. a refund) — but only override when nothing matched at all.
  if (!best && Number(amount) > 0) return { group: 'Income', category: 'Other income' };
  return best ? { group: best.group, category: best.category } : null;
}

module.exports = { TAXONOMY, GROUPS, isKnownGroup, isValidCategory, autoCategorize };

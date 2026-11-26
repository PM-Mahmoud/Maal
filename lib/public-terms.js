'use strict';

const membership = require('./membership');
const referrals = require('./referrals');

function publicTermsUrl(flag = process.env.PUBLIC_TERMS_LINKS) {
  return flag === '1' ? '/terms' : null;
}

function termsLocals(flag) {
  const { firstYearCents, yearCents } = membership.MEMBERSHIP;
  return {
    draft: !publicTermsUrl(flag),
    firstYear: membership.formatAud(firstYearCents),
    renewal: membership.formatAud(yearCents),
    trialDays: membership.TRIAL_DAYS,
    requiredPaid: referrals.REQUIRED_PAID,
    waitlistInvites: referrals.MAX_INVITE_SIGNUPS,
  };
}

module.exports = { publicTermsUrl, termsLocals };

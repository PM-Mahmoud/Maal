'use strict';

const DASHBOARD_REDIRECTS = {
  '/': '/app',
  '/assets': '/app/assets',
  '/vault': '/app/vault',
  '/transactions': '/app/transactions',
  '/goals': '/app/goals',
  '/ask': '/app/advisor',
  '/research': '/app/research',
  '/radar': '/app/radar',
  '/profile': '/app/onboarding',
  '/portfolio': '/app/portfolio-plan',
};
module.exports = function redirectDashboard(req, res) {
  const sub = (req.path.replace(/\/+$/, '') || '/');
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  res.redirect(301, (DASHBOARD_REDIRECTS[sub] || '/app') + query);
};

// routes/tools.js
// Serves /dashboard/tools — curated third-party platform recommendations.
// Owns: rendering the tools page with tier- and profile-aware filtering.
// Does NOT own: subscription management, profile storage, user auth state.

const express = require('express');
const router = express.Router();

const { findUserById } = require('../db/users');
const { getProfileByUserId } = require('../db/profiles');
const { getToolsForUser, tierFromUser } = require('../db/recommended-tools');

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

router.use(requireAuth);

// Set dashboard-layout for all pages in this router
router.use(function(req, res, next) { res.locals.layout = 'app-layout'; next(); });

// ── GET /dashboard/tools ──────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const user = await findUserById(req.session.userId);
    const profile = await getProfileByUserId(req.session.userId);

    const tier = tierFromUser(user);
    const prefersHalal = profile ? !!profile.prefers_halal : false;
    const hasSmsf = profile ? !!profile.has_smsf : false;
    const hasProperty = profile ? (profile.property_value > 0) : false;

    const tools = await getToolsForUser({ tier, prefersHalal, hasSmsf, hasProperty });

    // Group by category for display
    const categories = ['Screening', 'Equities', 'Sukuk', 'Precious Metals', 'Commodities', 'Alternatives', 'Startups'];
    const grouped = {};
    for (const cat of categories) {
      grouped[cat] = tools.filter(t => t.category === cat);
    }

    res.render('dashboard-tools', {
      user, profile,
      session: req.session,
      tools,
      grouped,
      categories,
      tier,
      prefersHalal,
      pageTitle: 'Recommended Tools',
    });
  } catch (err) {
    console.error('/dashboard/tools error:', err.message);
    res.status(500).render('error', { message: 'Failed to load tools.' });
  }
});

module.exports = router;

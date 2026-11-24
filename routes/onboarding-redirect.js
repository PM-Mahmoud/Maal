'use strict';

const router = require('express').Router();

// Old wizard bookmarks now open the welcome flow.
router.get(['/', '/*'], (_req, res) => res.redirect(301, '/welcome'));

module.exports = router;

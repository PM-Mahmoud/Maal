'use strict';
// Static file mounts for server.js, kept here so test/static-routing.test.js
// exercises the exact same options.
//
// `redirect: false` matters: public/app/assets is a real folder (the React
// bundle), so with serve-static's default a direct load or refresh of the SPA
// route /app/assets 301-redirected to /app/assets/ instead of rendering the
// Net worth page. With redirect off, a request that names a folder falls through
// (fallthrough is on by default) to the auth gate and the SPA catch-all.

const path = require('path');
const express = require('express');

function mountStatic(app, publicDir) {
  app.use(express.static(publicDir, { index: false, redirect: false }));
  app.use('/assets', express.static(path.join(publicDir, 'app', 'assets'), { index: false, redirect: false }));
}

module.exports = { mountStatic };

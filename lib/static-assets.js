'use strict';
// Static file mounts for server.js, kept here so test/static-routing.test.js
// exercises the exact same options.
//
// `redirect: false` matters: public/app/assets is a real folder (the React
// bundle), so with serve-static's default a direct load or refresh of the SPA
// route /app/assets 301-redirected to /app/assets/ instead of rendering the
// Net worth page. With redirect off, a request that names a folder falls through
// (fallthrough is on by default) to the auth gate and the SPA catch-all.
//
// Caching: every file Vite writes to public/app/assets has a content hash in its
// name, so it never changes at the same URL. Those get a one-year immutable
// Cache-Control, so repeat visits skip the revalidation round trip per chunk
// (each one was a 304 from the origin before). Everything else under public/
// (unhashed CSS/JS, images, index.html) keeps express's default
// "public, max-age=0" + ETag, so edits to those still show on the next load.

const path = require('path');
const express = require('express');

const { isStaticAssetPath } = require('./app-routes');

const IMMUTABLE = 'public, max-age=31536000, immutable';

function setImmutable(res) {
  res.setHeader('Cache-Control', IMMUTABLE);
}

// Missing files under the files-only folders (/app/assets/, /assets/, /css/, …)
// get a plain 404 here, before the session, the /app auth gate and the SPA
// catch-all, which used to answer them with the app page and a 200 (HEL-110).
function missingAsset(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!isStaticAssetPath(req.path)) return next();
  res.status(404).type('text/plain').send('Not found');
}

function mountStatic(app, publicDir, { sharedDir = path.join(publicDir, '..', 'shared') } = {}) {
  const hashedDir = path.join(publicDir, 'app', 'assets');
  app.use(express.static(publicDir, {
    index: false,
    redirect: false,
    setHeaders(res, filePath) {
      if (path.dirname(filePath) === hashedDir) setImmutable(res);
    },
  }));
  app.use('/assets', express.static(hashedDir, { index: false, redirect: false, setHeaders: setImmutable }));
  // The 404 page's brick animation: one module for the React bundle and the
  // server-rendered page (views/not-found.ejs), which loads it from here.
  const markModule = path.join(sharedDir, 'collapsing-mark.mjs');
  app.get('/js/collapsing-mark.mjs', (req, res, next) => {
    res.type('text/javascript');
    res.sendFile(markModule, (err) => { if (err) next(); });
  });
  app.use(missingAsset);
}

module.exports = { mountStatic, missingAsset, IMMUTABLE };

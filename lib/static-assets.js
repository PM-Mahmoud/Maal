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

const IMMUTABLE = 'public, max-age=31536000, immutable';

function setImmutable(res) {
  res.setHeader('Cache-Control', IMMUTABLE);
}

function mountStatic(app, publicDir) {
  const hashedDir = path.join(publicDir, 'app', 'assets');
  app.use(express.static(publicDir, {
    index: false,
    redirect: false,
    setHeaders(res, filePath) {
      if (path.dirname(filePath) === hashedDir) setImmutable(res);
    },
  }));
  app.use('/assets', express.static(hashedDir, { index: false, redirect: false, setHeaders: setImmutable }));
}

module.exports = { mountStatic, IMMUTABLE };

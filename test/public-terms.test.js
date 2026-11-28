'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
const membership = require('../lib/membership');
const { publicTermsUrl, termsLocals } = require('../lib/public-terms');

function render(file, locals) {
  return ejs.renderFile(path.join(__dirname, '../views', file + '.ejs'), locals);
}

test('terms links are opt-in and the default page is marked draft and noindex', async () => {
  assert.equal(publicTermsUrl(''), null);
  assert.equal(publicTermsUrl('true'), null);
  assert.equal(publicTermsUrl('1'), '/terms');
  const draft = await render('terms', termsLocals(''));
  assert.match(draft, /<strong>DRAFT<\/strong>/);
  assert.match(draft, /name="robots" content="noindex, nofollow"/);
  assert.match(draft, /\$4\.99/);
  assert.match(draft, /\$49\.99/);
  const approved = await render('terms', termsLocals('1'));
  assert.doesNotMatch(approved, /<strong>DRAFT|noindex/);
});

test('the public footer and signup link to terms only after approval', async () => {
  for (const template of ['partials/footer', 'auth-signup']) {
    const locals = { error: null, email: '', name: '', membership };
    const hidden = await render(template, { ...locals, publicTermsUrl: publicTermsUrl('') });
    const linked = await render(template, { ...locals, publicTermsUrl: publicTermsUrl('1') });
    assert.doesNotMatch(hidden, /href="\/terms"/);
    assert.match(linked, /href="\/terms"/);
  }
});

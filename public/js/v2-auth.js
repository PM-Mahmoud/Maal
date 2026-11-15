/* v2 auth pages (sign in, reset password, code entry) — shared behaviour.
   Loaded as a file (no inline handlers: Helmet CSP sets script-src-attr 'none').
   window.MaalAuth.passwordRules(input, opts) mirrors lib/password-rules.js. */
(function () {
  'use strict';

  // ── Show / hide password: <button data-eye-for="inputId"> ────────────────
  document.querySelectorAll('[data-eye-for]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-eye-for'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  // ── Live password rules (same rules as the server, lib/password-rules.js) ──
  function check(v) {
    return {
      upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), num: /[0-9]/.test(v),
      len: v.length >= 8 && v.length <= 64, special: /[^A-Za-z0-9]/.test(v)
    };
  }
  function strength(v) {
    var s = 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    return s;
  }
  var NAMES = ['', 'Very weak', 'Weak', 'Okay', 'Good', 'Strong'];
  var COLOURS = ['#E5E2DB', '#C2410C', '#D97706', '#CA8A04', '#0E8A7E', '#00A274'];

  // input: the password <input>; rulesEl: <ul> of li[data-rule]; label/bars
  // optional. onChange(allOk) fires on every keystroke.
  function passwordRules(input, opts) {
    opts = opts || {};
    var rules = opts.rulesEl ? opts.rulesEl.querySelectorAll('li[data-rule]') : [];
    var bars = opts.barsEl ? opts.barsEl.querySelectorAll('span') : [];
    function update() {
      var v = input.value;
      var c = check(v);
      var allOk = c.len && c.upper && c.lower && c.num && c.special;
      Array.prototype.forEach.call(rules, function (li) {
        var ok = c[li.getAttribute('data-rule')];
        li.className = v ? (ok ? 'ok' : 'bad') : '';
      });
      var s = v ? Math.max(1, strength(v)) : 0;
      if (opts.labelEl) { opts.labelEl.textContent = v ? NAMES[s] : ''; opts.labelEl.style.color = COLOURS[s]; }
      Array.prototype.forEach.call(bars, function (b, i) { b.style.background = i < s ? COLOURS[s] : ''; });
      if (opts.onChange) opts.onChange(allOk);
      return allOk;
    }
    input.addEventListener('input', update);
    update();
    return { update: update, isValid: function () { var c = check(input.value); return c.len && c.upper && c.lower && c.num && c.special; } };
  }

  // ── 6-digit code boxes: <div data-otp data-target="hiddenId"> of inputs ──
  function otpBoxes(wrap, onChange) {
    var digits = wrap.querySelectorAll('input');
    var hidden = document.getElementById(wrap.getAttribute('data-target'));
    function sync() {
      var code = Array.prototype.map.call(digits, function (d) { return d.value; }).join('');
      if (hidden) hidden.value = code;
      Array.prototype.forEach.call(digits, function (d) { d.classList.toggle('filled', d.value !== ''); });
      if (onChange) onChange(code);
    }
    Array.prototype.forEach.call(digits, function (d, i) {
      d.addEventListener('input', function () {
        var val = d.value.replace(/\D/g, '');
        if (val.length > 1) { // autofill / typed fast: spread across boxes
          val.split('').slice(0, digits.length - i).forEach(function (ch, j) { digits[i + j].value = ch; });
          digits[Math.min(i + val.length, digits.length - 1)].focus();
        } else {
          d.value = val;
          if (val && i < digits.length - 1) digits[i + 1].focus();
        }
        sync();
      });
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !d.value && i > 0) { digits[i - 1].focus(); digits[i - 1].value = ''; sync(); }
        if (e.key === 'ArrowLeft' && i > 0) digits[i - 1].focus();
        if (e.key === 'ArrowRight' && i < digits.length - 1) digits[i + 1].focus();
      });
      d.addEventListener('paste', function (e) {
        e.preventDefault();
        var paste = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, digits.length);
        paste.split('').forEach(function (ch, j) { if (digits[j]) digits[j].value = ch; });
        if (paste.length) digits[Math.min(paste.length, digits.length - 1)].focus();
        sync();
      });
    });
    sync();
    return { focus: function () { digits[0].focus(); } };
  }

  window.MaalAuth = { passwordRules: passwordRules, otpBoxes: otpBoxes, checkPassword: check };
})();

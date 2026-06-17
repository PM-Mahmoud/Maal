/* ============================================================
   Maal app interactivity — tabs, modals, toasts, page wiring
   ============================================================ */
(function () {
  'use strict';

  /* ─── helpers ─────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#mz-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mz-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  function audFmt(n) {
    n = Number(n) || 0;
    return '$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
  }

  /* Simple modal factory (one at a time) */
  function openModal(title, bodyHTML, onSubmit, submitLabel) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'mz-modal';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal">' +
      '<h2>' + title + '</h2>' +
      '<div class="mz-modal-body">' + bodyHTML + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-modal-cancel>Cancel</button>' +
      '<button type="button" class="btn btn-accent btn-sm" data-modal-ok>' + (submitLabel || 'Save') + '</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.hasAttribute('data-modal-cancel')) closeModal();
    });
    $('[data-modal-ok]', overlay).addEventListener('click', function () {
      if (onSubmit(overlay) !== false) closeModal();
    });
    var first = overlay.querySelector('input, select, textarea');
    if (first) first.focus();
  }
  function closeModal() {
    var m = $('#mz-modal');
    if (m) m.remove();
  }

  /* ─── 1. Generic tab toggling (all .tabs groups) ──────── */
  $all('.tabs').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t || !group.contains(t)) return;
      $all('.tab', group).forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      group.dispatchEvent(new CustomEvent('tabchange', { detail: t.textContent.trim() }));
    });
  });

  /* ─── 2. Dashboard charts — real data + time-range tabs ── */
  // window.MAAL_SNAPSHOTS = [{ d: date, nw, inv, sup, debt }] (daily, oldest first)
  function drawSpark(svgId, series) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var line = svg.querySelector('path.line');
    var fill = svg.querySelector('path.fill');
    if (!series.length) { line.setAttribute('d', ''); fill.setAttribute('d', ''); return; }
    if (series.length === 1) series = [series[0], series[0]]; // flat line for day one
    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    var span = (max - min) || 1;
    var pts = series.map(function (v, i) {
      var x = (i / (series.length - 1)) * 200;
      var y = 32 - ((v - min) / span) * 26; // padding: 6 top, 4 bottom
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    var d = 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L');
    line.setAttribute('d', d);
    fill.setAttribute('d', d + ' L200,36 L0,36 Z');
  }

  // metric → snapshot field, label, and whether "up" is bad (debts)
  var METRICS = {
    networth: { field: 'nw',   label: 'Net Worth',   invert: false },
    invest:   { field: 'inv',  label: 'Investments', invert: false },
    cash:     { field: 'cash', label: 'Total Cash',  invert: false },
    debts:    { field: 'debt', label: 'Total Debts', invert: true }
  };

  function rangeDays(label) {
    if (label === '1M') return 31;
    if (label === '3M') return 92;
    if (label === '1Y') return 366;
    return 100000; // All
  }
  function inRange(list, label) {
    if (!list || !list.length) return [];
    if (label === 'All') return list.slice();
    var cutoff = Date.now() - rangeDays(label) * 86400000;
    var v = list.filter(function (x) { return new Date(x.d).getTime() >= cutoff; });
    return v.length ? v : list.slice();
  }
  function snapsInRange(label) { return inRange(window.MAAL_SNAPSHOTS || [], label); }

  // Money in/out from signed transactions over the range
  function flowSummary(label) {
    var txns = window.MAAL_TXNS || [];
    if (label !== 'All') {
      var cutoff = Date.now() - rangeDays(label) * 86400000;
      txns = txns.filter(function (t) { return new Date(t.d).getTime() >= cutoff; });
    }
    var inSum = 0, outSum = 0;
    txns.forEach(function (t) { var a = Number(t.amt) || 0; if (a >= 0) inSum += a; else outSum += -a; });
    return { moneyIn: inSum, moneyOut: outSum, net: inSum - outSum, count: txns.length };
  }

  function deltaText(metric, visible, label) {
    var cfg = METRICS[metric];
    if (visible.length < 2) return null; // keep the server descriptive text
    var first = visible[0][cfg.field], last = visible[visible.length - 1][cfg.field];
    var diff = last - first;
    var pct = first !== 0 ? (diff / Math.abs(first)) * 100 : 0;
    var sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    var good = cfg.invert ? diff <= 0 : diff >= 0;
    return {
      text: sign + audFmt(Math.abs(diff)) + ' · ' + (pct >= 0 ? '+' : '') + (Math.round(pct * 10) / 10) + '% over ' + label,
      good: good, changed: diff !== 0
    };
  }

  function renderCharts(label) {
    var visible = snapsInRange(label);
    drawSpark('spark-networth', visible.map(function (s) { return s.nw; }));
    drawSpark('spark-invest',   visible.map(function (s) { return s.inv; }));
    drawSpark('spark-cash',     visible.map(function (s) { return s.cash; }));
    drawSpark('spark-debts',    visible.map(function (s) { return s.debt; }));
    Object.keys(METRICS).forEach(function (metric) {
      var el = $('[data-delta="' + metric + '"]');
      if (!el) return;
      var d = deltaText(metric, visible, label);
      if (!d) return; // not enough history — leave the descriptive text
      el.textContent = d.text;
      el.classList.toggle('up', d.good && d.changed);
      el.classList.toggle('down', !d.good && d.changed);
    });
  }

  /* ─── 2b. Expanded trend modal (click a stat tile) ─────── */
  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
  }
  function buildBigChart(series, dates) {
    if (!series.length) return '<div class="empty" style="padding:2.5rem 1rem;"><p>No history yet for this range — it builds as snapshots accrue daily.</p></div>';
    if (series.length === 1) { series = [series[0], series[0]]; dates = [dates[0], dates[0]]; }
    var W = 640, H = 240, padL = 6, padR = 6, padT = 14, padB = 30;
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
    var span = (max - min) || Math.abs(max) || 1;
    var lo = min - span * 0.08, hi = max + span * 0.08, rng = (hi - lo) || 1;
    var n = series.length;
    function X(i) { return padL + (i / (n - 1)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - lo) / rng) * (H - padT - padB); }
    var pts = series.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
    var line = 'M' + pts.join(' L');
    var area = line + ' L' + X(n - 1).toFixed(1) + ',' + (H - padB) + ' L' + X(0).toFixed(1) + ',' + (H - padB) + ' Z';
    var grid = '';
    for (var g = 0; g <= 2; g++) { var gy = (padT + (g / 2) * (H - padT - padB)).toFixed(1); grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" class="tc-grid"/>'; }
    return '<svg class="trend-chart-svg" viewBox="0 0 ' + W + ' ' + H + '">' + grid +
      '<path d="' + area + '" class="tc-fill"/><path d="' + line + '" class="tc-line"/></svg>' +
      '<div class="trend-axis"><span>' + fmtDate(dates[0]) + '</span><span>' + fmtDate(dates[dates.length - 1]) + '</span></div>';
  }

  function openTrendModal(metric, startRange) {
    var cfg = METRICS[metric];
    if (!cfg) return;
    var nowValEl = $('.stat-card[data-trend="' + metric + '"] .stat-value');
    var nowVal = nowValEl ? nowValEl.textContent : '';
    var range = startRange || (($('#range-tabs .tab.active') || {}).textContent || '1M').trim();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal trend-modal">' +
      '<div class="trend-head">' +
        '<div><div class="trend-title">' + cfg.label + '</div><div class="trend-now">' + nowVal + '</div></div>' +
        '<div class="tabs trend-range">' +
          ['1M', '3M', '1Y', 'All'].map(function (r) { return '<button class="tab' + (r === range ? ' active' : '') + '">' + r + '</button>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div class="trend-body"></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost btn-sm" data-trend-close>Close</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    function render(r) {
      var visible = snapsInRange(r);
      var series = visible.map(function (s) { return s[cfg.field]; });
      var dates = visible.map(function (s) { return s.d; });
      var open = series.length ? series[0] : 0, close = series.length ? series[series.length - 1] : 0;
      var diff = close - open;
      var good = cfg.invert ? diff <= 0 : diff >= 0;
      var flow = flowSummary(r);
      var inW = flow.moneyIn, outW = flow.moneyOut, tot = inW + outW;
      var body =
        '<div class="trend-chart">' + buildBigChart(series, dates) + '</div>' +
        '<div class="trend-stats">' +
          '<div><div class="ts-k">Opening</div><div class="ts-v">' + audFmt(open) + '</div></div>' +
          '<div><div class="ts-k">Closing</div><div class="ts-v">' + audFmt(close) + '</div></div>' +
          '<div><div class="ts-k">Change</div><div class="ts-v ' + (diff === 0 ? '' : good ? 'up' : 'down') + '">' +
            (diff > 0 ? '+' : diff < 0 ? '−' : '') + audFmt(Math.abs(diff)) + '</div></div>' +
        '</div>' +
        '<div class="trend-flow">' +
          '<div class="tf-title">Money in &amp; out · ' + r + (flow.count ? ' (' + flow.count + ' transactions)' : '') + '</div>' +
          (tot > 0
            ? '<div class="tf-bar"><span class="tf-in" style="flex:' + inW + '"></span><span class="tf-out" style="flex:' + outW + '"></span></div>'
            : '<div class="row-sub" style="padding:0.4rem 0;">No transactions in this period. Connect a bank via Basiq and sync to see money in and out here.</div>') +
          (tot > 0
            ? '<div class="tf-legend"><span class="up">▲ In ' + audFmt(flow.moneyIn) + '</span>' +
              '<span class="down">▼ Out ' + audFmt(flow.moneyOut) + '</span>' +
              '<span>Net ' + (flow.net >= 0 ? '+' : '−') + audFmt(Math.abs(flow.net)) + '</span></div>'
            : '') +
        '</div>';
      $('.trend-body', overlay).innerHTML = body;
    }
    render(range);

    var rangeBox = $('.trend-range', overlay);
    rangeBox.addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      $all('.tab', rangeBox).forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      render(t.textContent.trim());
    });
    function close() { overlay.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.hasAttribute('data-trend-close')) close(); });
    document.addEventListener('keydown', esc);
  }

  var rangeTabs = $('#range-tabs');
  if (rangeTabs && document.getElementById('spark-networth')) {
    renderCharts('1M');
    rangeTabs.addEventListener('tabchange', function (e) {
      $all('.range-chip').forEach(function (c) { c.textContent = e.detail; });
      renderCharts(e.detail);
    });
  }

  // Click / keyboard a stat tile to expand its trend
  $all('.stat-card[data-trend]').forEach(function (card) {
    card.addEventListener('click', function () { openTrendModal(card.getAttribute('data-trend')); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTrendModal(card.getAttribute('data-trend')); }
    });
  });

  /* ─── 3. Add asset / liability (persists to profile) ──── */
  var ASSET_FIELDS = {
    cash_savings:         'Cash & savings',
    super_balance:        'Superannuation',
    investment_portfolio: 'Investments (shares, ETFs, crypto)',
    property_value:       'Property',
    monthly_expenses:     'Monthly spending (for runway)',
    hecs_balance:         'HECS-HELP balance',
    total_debt:           'Other debt (loans, cards)'
  };

  function assetModal(preselect, isLiability) {
    var opts = Object.keys(ASSET_FIELDS)
      .filter(function (k) {
        var isDebt = (k === 'hecs_balance' || k === 'total_debt');
        return isLiability ? isDebt : !isDebt;
      })
      .map(function (k) {
        return '<option value="' + k + '"' + (k === preselect ? ' selected' : '') + '>' + ASSET_FIELDS[k] + '</option>';
      }).join('');
    openModal(
      isLiability ? 'Add a liability' : 'Add an asset',
      '<div class="field"><label>Category</label><select id="mz-asset-field">' + opts + '</select></div>' +
      '<div class="field"><label>Current value (AUD)</label><input type="number" id="mz-asset-amount" min="0" step="100" placeholder="e.g. 40000"></div>' +
      '<p style="font-size:0.75rem;color:var(--fg-faint);margin:0;">This sets the current balance for the category — it updates your dashboard and scores.</p>',
      function (overlay) {
        var field = $('#mz-asset-field', overlay).value;
        var amount = parseInt($('#mz-asset-amount', overlay).value, 10);
        if (isNaN(amount) || amount < 0) { toast('Enter a valid amount'); return false; }
        fetch('/dashboard/assets/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: field, amount: amount })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) { toast('Saved — ' + ASSET_FIELDS[field] + ' set to ' + audFmt(amount)); setTimeout(function () { location.reload(); }, 700); }
          else toast(j.error || 'Could not save');
        }).catch(function () { toast('Could not save — are you online?'); });
      },
      'Save'
    );
  }

  $all('[data-add-asset]').forEach(function (btn) {
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var f = btn.getAttribute('data-add-asset');
      assetModal(f, f === 'hecs_balance' || f === 'total_debt');
    });
  });

  /* ─── 4. Institution tiles (Basiq connect — live or demo) ── */
  $all('.inst').forEach(function (tile) {
    tile.addEventListener('click', function () {
      // Live mode: BASIQ_API_KEY configured → launch the real consent flow
      if (tile.closest('[data-basiq-live]')) { location.href = '/basiq/connect'; return; }
      if (tile.classList.contains('connected')) { toast('Already connected (demo)'); return; }
      var name = ($('.inst-name', tile) || {}).textContent || 'Bank';
      openModal(
        'Connect ' + name,
        '<p style="font-size:0.85rem;color:var(--fg-muted);margin:0 0 0.8rem;">This is a demo of the Basiq (Consumer Data Right) flow. In production you would be redirected to ' + name + ' to approve read-only access.</p>' +
        '<p style="font-size:0.75rem;color:var(--fg-faint);margin:0;">🔒 Maal can never move money. Access is revocable anytime.</p>',
        function () {
          fetch('/dashboard/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ institution_name: name, institution_type: 'bank', account_reference: 'Basiq demo', balance: 0 })
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (j.ok) { tile.classList.add('connected'); toast(name + ' connected (demo) — see Insights → Linked Accounts'); }
            else toast(j.error || 'Could not connect');
          }).catch(function () { toast('Could not connect'); });
        },
        'Connect (demo)'
      );
    });
  });

  /* ─── 5. Goals page (real, server-backed) ─────────────── */
  var goalsList = $('#goals-list');
  if (goalsList) {
    var GOAL_TYPES = ['Grow', 'Save', 'Pay Off', 'Invest'];

    function goalModal() {
      openModal('Create a goal',
        '<div class="field"><label>Goal name</label><input type="text" id="mz-goal-name" placeholder="e.g. Emergency fund"></div>' +
        '<div class="field"><label>Type</label><select id="mz-goal-type">' + GOAL_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Target amount (AUD)</label><input type="number" id="mz-goal-target" min="1" placeholder="e.g. 10000"></div>' +
        '<div class="field"><label>Saved so far (AUD)</label><input type="number" id="mz-goal-current" min="0" value="0"></div>',
        function (o) {
          var name = $('#mz-goal-name', o).value.trim();
          var target = parseInt($('#mz-goal-target', o).value, 10);
          if (!name || isNaN(target) || target <= 0) { toast('Add a name and target'); return false; }
          fetch('/dashboard/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name, type: $('#mz-goal-type', o).value,
              target: target, current: parseInt($('#mz-goal-current', o).value, 10) || 0
            })
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (j.ok) { toast('Goal created 🎯'); setTimeout(function () { location.reload(); }, 500); }
            else toast(j.error || 'Could not create goal');
          }).catch(function () { toast('Could not create goal'); });
        },
        'Create goal');
    }

    $all('[data-new-goal]').forEach(function (b) { b.addEventListener('click', goalModal); });

    // Delete a goal
    $all('[data-del-goal]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Delete this goal?')) return;
        fetch('/dashboard/goals/' + b.getAttribute('data-del-goal'), { method: 'DELETE' })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.ok) { var c = b.closest('.goal-card'); if (c) c.remove(); toast('Goal removed'); } });
      });
    });

    // Update saved-so-far
    $all('[data-save-progress]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-save-progress');
        var input = $('.goal-progress-input[data-goal-id="' + id + '"]');
        fetch('/dashboard/goals/' + id + '/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: parseInt(input.value, 10) || 0 })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) { toast('Progress updated'); setTimeout(function () { location.reload(); }, 400); }
          else toast(j.error || 'Could not update');
        }).catch(function () { toast('Could not update'); });
      });
    });

    // Client-side type filter
    var goalTabs = $('#goal-tabs');
    if (goalTabs) goalTabs.addEventListener('tabchange', function (e) {
      var f = e.detail;
      $all('.goal-card', goalsList).forEach(function (c) {
        c.style.display = (f === 'All Goals' || c.getAttribute('data-goal-type') === f) ? '' : 'none';
      });
    });
  }

  /* ─── 6. Radar page (real, server-backed) ─────────────── */
  var radarCreate = $('#radar-create');
  if (radarCreate) {
    radarCreate.addEventListener('click', function () {
      var text = (($('#radar-text') || {}).value || '').trim();
      if (!text) { toast('Describe what Maal should watch'); $('#radar-text').focus(); return; }
      var freqTab = $('#radar-freq .tab.active');
      var frequency = (freqTab ? freqTab.textContent.trim() : 'Daily').toLowerCase();
      radarCreate.disabled = true;
      fetch('/dashboard/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          frequency: frequency,
          notifyEmail: ($('#radar-email') || {}).checked !== false,
          notifySms: !!($('#radar-sms') || {}).checked
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        radarCreate.disabled = false;
        if (j.ok) { toast('Radar created 📡'); setTimeout(function () { location.reload(); }, 600); }
        else toast(j.error || 'Could not create radar');
      }).catch(function () { radarCreate.disabled = false; toast('Could not create radar — are you online?'); });
    });

    // Delete a radar
    $all('[data-radar-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Delete this radar?')) return;
        fetch('/dashboard/radar/' + b.getAttribute('data-radar-del'), { method: 'DELETE' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.ok) { var row = b.closest('[data-radar]'); if (row) row.remove(); toast('Radar deleted'); }
            else toast(j.error || 'Could not delete');
          }).catch(function () { toast('Could not delete radar'); });
      });
    });

    // Run a radar on demand
    $all('[data-radar-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        var orig = b.textContent;
        b.disabled = true; b.textContent = '…';
        fetch('/dashboard/radar/' + b.getAttribute('data-radar-run') + '/run', { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            b.disabled = false; b.textContent = orig;
            if (j.ok) { toast(j.alerted ? '📡 Alert: ' + j.summary.slice(0, 80) : 'Checked — nothing to flag'); setTimeout(function () { location.reload(); }, 1400); }
            else toast(j.error || 'Run failed');
          }).catch(function () { b.disabled = false; b.textContent = orig; toast('Run failed'); });
      });
    });

    $all('[data-radar-template]').forEach(function (row) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        $('#radar-text').value = row.getAttribute('data-radar-template');
        $('#radar-text').focus();
        toast('Template loaded — tweak it and hit Create');
      });
    });
  }

  /* ─── 7. Shared advisor chat (DeepSeek via /dashboard/ask/message) ── */
  function makeChatSession(threadEl) {
    var history = [];
    function bubble(role, text) {
      var el = document.createElement('div');
      el.className = 'chat-msg ' + (role === 'user' ? 'me' : 'bot');
      el.textContent = text;
      threadEl.appendChild(el);
      threadEl.style.display = 'flex';
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return el;
    }
    return function send(text) {
      bubble('user', text);
      history.push({ role: 'user', content: text });
      var typing = bubble('assistant', '…');
      typing.style.opacity = '0.6';
      fetch('/dashboard/ask/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(function (r) { return r.json(); }).then(function (j) {
        typing.style.opacity = '';
        if (j.ok) {
          typing.textContent = j.reply;
          history.push({ role: 'assistant', content: j.reply });
        } else {
          typing.textContent = j.error || 'Something went wrong — try again.';
        }
        typing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }).catch(function () {
        typing.style.opacity = '';
        typing.textContent = 'Connection hiccup — try again in a moment.';
      });
    };
  }

  /* Ask Maal page */
  var askSend = $('#ask-send');
  if (askSend) {
    var askChat = makeChatSession($('#ask-thread'));
    askSend.addEventListener('click', function () {
      var input = $('#ask-input');
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      input.value = '';
      askChat(text);
    });
    $('#ask-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askSend.click(); }
    });
    $all('[data-ask-suggest]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#ask-input').value = b.textContent.trim();
        $('#ask-input').focus();
      });
    });
  }

  /* Floating chat widget (markup lives in app-layout) */
  var widgetSend = $('#chat-send');
  if (widgetSend && $('#chat-body')) {
    var widgetChat = makeChatSession($('#chat-body'));
    var widgetInput = $('#chat-input');
    function widgetGo() {
      var text = widgetInput.value.trim();
      if (!text) return;
      widgetInput.value = '';
      widgetChat(text);
    }
    widgetSend.addEventListener('click', widgetGo);
    widgetInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') widgetGo(); });
  }

  /* ─── 8. Research page (real, server-backed) ──────────── */
  var researchRun = $('#research-run');
  if (researchRun) {
    var reportEl = $('#research-report');

    function showReport(data) {
      if (!reportEl) return;
      $('#research-report-q').textContent = data.question || '';
      $('#research-report-body').textContent = data.report || '';
      var statusEl = $('#research-report-status');
      statusEl.textContent = data.status === 'error' ? 'Error' : 'Ready';
      statusEl.className = 'chip ' + (data.status === 'error' ? 'chip-danger' : 'chip-accent');
      var src = $('#research-report-sources');
      var sources = data.sources || [];
      if (sources.length) {
        src.innerHTML = '<div class="row-sub" style="font-weight:600; margin-bottom:0.3rem;">Sources</div>' +
          sources.map(function (s, i) {
            return '<div class="row-sub" style="padding:0.15rem 0;">[' + (i + 1) + '] <a href="' + s.url +
              '" target="_blank" rel="noopener" style="color:var(--accent);">' + (s.title || s.url) + '</a>' +
              (s.source ? ' · ' + s.source : '') + '</div>';
          }).join('');
      } else { src.innerHTML = ''; }
      reportEl.style.display = '';
      reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function runResearch() {
      var input = $('#research-input');
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      researchRun.disabled = true;
      reportEl.style.display = '';
      $('#research-report-q').textContent = text;
      $('#research-report-body').textContent = 'Researching — pulling live data and reading the latest news…';
      $('#research-report-status').textContent = 'Running';
      $('#research-report-status').className = 'chip chip-muted';
      $('#research-report-sources').innerHTML = '';
      reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      fetch('/dashboard/research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      }).then(function (r) { return r.json(); }).then(function (j) {
        researchRun.disabled = false;
        if (j.ok) {
          input.value = '';
          showReport({ question: j.question, report: j.report, sources: j.sources, status: 'complete' });
          setTimeout(function () { location.reload(); }, 1200); // refresh history list
        } else {
          showReport({ question: text, report: j.error || 'Something went wrong.', status: 'error' });
        }
      }).catch(function () {
        researchRun.disabled = false;
        showReport({ question: text, report: 'Connection hiccup — try again in a moment.', status: 'error' });
      });
    }

    researchRun.addEventListener('click', runResearch);
    $('#research-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runResearch(); }
    });
    $all('[data-research-suggest]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#research-input').value = b.textContent.trim();
        $('#research-input').focus();
      });
    });
    // Open a past report from the history list
    $all('[data-report-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        fetch('/dashboard/research/' + row.getAttribute('data-report-id'))
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.ok) showReport(j); })
          .catch(function () { toast('Could not load that report'); });
      });
    });
  }

  /* ─── 9. Vault + transactions file uploads (real, server-backed) ─── */
  $all('[data-dropzone]').forEach(function (zone) {
    var kind = zone.getAttribute('data-kind') || (zone.getAttribute('data-dropzone') === 'vault' ? 'vault' : 'statement');
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.csv,.docx,.xlsx,.png,.jpg,.jpeg';
    input.style.display = 'none';
    zone.parentNode.appendChild(input);
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
    zone.addEventListener('dragleave', function () { zone.style.borderColor = ''; });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.style.borderColor = '';
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', function () { handleFiles(input.files); });

    function handleFiles(files) {
      if (!files || !files.length) return;
      var queue = Array.prototype.slice.call(files);
      var done = 0, failed = 0;
      toast('Uploading ' + queue.length + ' file' + (queue.length > 1 ? 's' : '') + '…');
      queue.forEach(function (f) {
        if (f.size > 10 * 1024 * 1024) { failed++; toast(f.name + ' is over 10 MB — skipped'); return finish(); }
        var fd = new FormData();
        fd.append('file', f);
        fd.append('kind', kind);
        fetch('/dashboard/vault/upload', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (!j.ok) failed++; finish(); })
          .catch(function () { failed++; finish(); });
      });
      function finish() {
        done++;
        if (done === queue.length) {
          if (failed) toast(failed + ' upload' + (failed > 1 ? 's' : '') + ' failed');
          else toast('Uploaded ✓');
          setTimeout(function () { location.reload(); }, 700);
        }
      }
    }
  });

  // Delete a stored file (server-rendered rows)
  $all('[data-del-file]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('Delete this file?')) return;
      fetch('/dashboard/vault/file/' + b.getAttribute('data-del-file'), { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.ok) { var row = b.closest('[data-file-row]'); if (row) row.remove(); toast('File deleted'); } });
    });
  });

  /* ─── 10. Settings: notification prefs (server) + delete account ─── */
  if (location.pathname.indexOf('/dashboard/settings') === 0) {
    $all('.switch input[data-notif]').forEach(function (sw) {
      sw.addEventListener('change', function () {
        fetch('/dashboard/settings/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: sw.getAttribute('data-notif'), value: sw.checked })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) toast(sw.checked ? 'Notification on' : 'Notification off');
          else { sw.checked = !sw.checked; toast(j.error || 'Could not save'); }
        }).catch(function () { sw.checked = !sw.checked; toast('Could not save preference'); });
      });
    });
    var del = $('#settings-delete');
    if (del) del.addEventListener('click', function () {
      if (confirm('Are you sure you want to delete your account? This is irreversible.') &&
          confirm('Really delete? All your data will be permanently removed.')) {
        fetch('/api/account/delete', { method: 'POST' }).then(function (r) {
          if (r.ok) { window.location.href = '/'; }
          else { toast('Could not delete your account — please contact support.'); }
        }).catch(function () { toast('Could not delete your account — are you online?'); });
      }
    });
  }

  /* (Profile fields now persist server-side via the form POST — the old
     localStorage autosave hack was removed.) */

  /* ─── 12. Feedback modal (sidebar) ────────────────────── */
  var feedbackOpen = $('#feedback-open');
  if (feedbackOpen) {
    feedbackOpen.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(
        'Share feedback',
        '<p style="font-size:0.83rem;color:var(--fg-muted);margin:0 0 0.8rem;">What\'s working? What\'s missing? Every note lands directly with the team.</p>' +
        '<div class="field"><textarea id="mz-feedback-msg" rows="5" maxlength="4000" placeholder="Tell us what you think…"></textarea></div>',
        function (overlay) {
          var msg = $('#mz-feedback-msg', overlay).value.trim();
          if (!msg) { toast('Tell us a little more first'); return false; }
          fetch('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, page: location.pathname })
          }).then(function (r) { return r.json(); }).then(function (j) {
            toast(j.ok ? 'Thank you — feedback received 🙏' : (j.error || 'Could not send feedback'));
          }).catch(function () { toast('Could not send feedback — are you online?'); });
        },
        'Send feedback'
      );
    });
  }

  /* ─── 13. Roadmap: submit + voting ────────────────────── */
  var roadmapSubmit = $('#roadmap-submit');
  if (roadmapSubmit) {
    roadmapSubmit.addEventListener('click', function () {
      var title = $('#roadmap-title').value.trim();
      if (!title) { toast('Give your request a short title'); $('#roadmap-title').focus(); return; }
      fetch('/dashboard/roadmap/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, details: $('#roadmap-details').value.trim() })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) { toast('Request submitted 🚀'); setTimeout(function () { location.reload(); }, 600); }
        else toast(j.error || 'Could not submit');
      }).catch(function () { toast('Could not submit — are you online?'); });
    });
  }

  $all('[data-roadmap-item]').forEach(function (row) {
    var itemId = row.getAttribute('data-roadmap-item');
    $all('.vote-btn', row).forEach(function (btn) {
      btn.addEventListener('click', function () {
        fetch('/dashboard/roadmap/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: itemId, vote: parseInt(btn.getAttribute('data-vote'), 10) })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!j.ok) { toast(j.error || 'Could not vote'); return; }
          // Update score + button states in place
          var score = $('[data-vote-score]', row);
          var up = $('.vote-btn[data-vote="1"]', row);
          var down = $('.vote-btn[data-vote="-1"]', row);
          var prev = up.classList.contains('voted') ? 1 : down.classList.contains('voted') ? -1 : 0;
          var next = j.vote === null ? 0 : j.vote;
          score.textContent = parseInt(score.textContent, 10) - prev + next;
          up.classList.toggle('voted', next === 1);
          down.classList.toggle('voted', next === -1);
          down.classList.toggle('down', next === -1);
        }).catch(function () { toast('Could not vote — are you online?'); });
      });
    });
  });

  /* ─── 14. Two-factor toggle (Settings → Security) ─────── */
  var tfa = $('#tfa-switch');
  if (tfa) {
    tfa.addEventListener('change', function () {
      fetch('/dashboard/settings/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: tfa.checked })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) toast(j.enabled ? '2FA on — we\'ll email you a code at sign-in 🔐' : 'Two-factor authentication off');
        else { tfa.checked = !tfa.checked; toast(j.error || 'Could not update 2FA'); }
      }).catch(function () { tfa.checked = !tfa.checked; toast('Could not update 2FA'); });
    });
  }

  /* ─── 15. Institution tile search (filters the bank grid) ── */
  $all('[data-inst-search]').forEach(function (input) {
    // Filter the nearest following .inst-grid by institution name
    var grid = input.closest('.panel') ? input.closest('.panel').querySelector('.inst-grid') : null;
    if (!grid) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      $all('.inst', grid).forEach(function (tile) {
        var name = ((tile.querySelector('.inst-name') || {}).textContent || '').toLowerCase();
        tile.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
      });
    });
  });

  /* ─── 16. Misc demo buttons ───────────────────────────── */
  $all('[data-demo-soon]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      toast(b.getAttribute('data-demo-soon'));
    });
  });
})();

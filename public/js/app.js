/* ============================================================
   Mizan app interactivity — tabs, modals, toasts, page wiring
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
  // window.MIZAN_SNAPSHOTS = [{ d: date, nw, inv, sup, debt }] (daily, oldest first)
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

  function rangeToDays(label) {
    if (label === '1M') return 31;
    if (label === '6M') return 184;
    if (label === 'All') return 100000;
    // YTD
    var now = new Date();
    return Math.max(2, Math.round((now - new Date(now.getFullYear(), 0, 1)) / 86400000));
  }

  function renderCharts(rangeLabel) {
    var snaps = window.MIZAN_SNAPSHOTS || [];
    var days = rangeToDays(rangeLabel);
    var cutoff = Date.now() - days * 86400000;
    var visible = snaps.filter(function (s) { return new Date(s.d).getTime() >= cutoff; });
    if (!visible.length) visible = snaps;
    drawSpark('spark-networth', visible.map(function (s) { return s.nw; }));
    drawSpark('spark-invest',   visible.map(function (s) { return s.inv; }));
    drawSpark('spark-super',    visible.map(function (s) { return s.sup; }));
    drawSpark('spark-debts',    visible.map(function (s) { return s.debt; }));
    // delta text from real data
    var d = $('[data-networth-delta]');
    if (d && visible.length >= 2) {
      var first = visible[0].nw, last = visible[visible.length - 1].nw;
      if (first !== 0) {
        var pct = ((last - first) / Math.abs(first)) * 100;
        d.textContent = (pct >= 0 ? '+' : '') + (Math.round(pct * 10) / 10) + '% over ' + rangeLabel;
        d.classList.toggle('up', pct >= 0);
        d.classList.toggle('down', pct < 0);
      }
    } else if (d && visible.length < 2) {
      d.textContent = 'Day one — your history builds from today';
    }
  }

  var rangeTabs = $('#range-tabs');
  if (rangeTabs && document.getElementById('spark-networth')) {
    renderCharts('YTD');
    rangeTabs.addEventListener('tabchange', function (e) {
      $all('.range-chip').forEach(function (c) { c.textContent = e.detail; });
      renderCharts(e.detail);
    });
  }

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
        '<p style="font-size:0.75rem;color:var(--fg-faint);margin:0;">🔒 Mizan can never move money. Access is revocable anytime.</p>',
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

  /* ─── 5. Goals page ───────────────────────────────────── */
  var goalsList = $('#goals-list');
  if (goalsList) {
    var GOAL_TYPES = ['Grow', 'Save', 'Pay Off', 'Invest'];
    var goalFilter = 'All Goals';

    function renderGoals() {
      var goals = store('mizan-goals') || [];
      var visible = goals.filter(function (g) { return goalFilter === 'All Goals' || g.type === goalFilter; });
      var empty = $('#goals-empty');
      if (empty) empty.style.display = visible.length ? 'none' : '';
      $all('.goal-card', goalsList).forEach(function (c) { c.remove(); });
      visible.forEach(function (g, i) {
        var pct = g.target > 0 ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : 0;
        var card = document.createElement('div');
        card.className = 'panel goal-card';
        card.style.marginBottom = '0.8rem';
        card.innerHTML =
          '<div class="panel-title">' + g.name +
          ' <span><span class="chip chip-accent">' + g.type + '</span> ' +
          '<button class="icon-btn" data-del-goal="' + goals.indexOf(g) + '" title="Delete">✕</button></span></div>' +
          '<div class="row-item" style="border:none;padding:0.2rem 0;"><div class="row-sub">' + audFmt(g.current || 0) + ' of ' + audFmt(g.target) + '</div><div class="row-val">' + pct + '%</div></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;"></div></div>';
        goalsList.appendChild(card);
      });
      $all('[data-del-goal]').forEach(function (b) {
        b.addEventListener('click', function () {
          var all = store('mizan-goals') || [];
          all.splice(parseInt(b.getAttribute('data-del-goal'), 10), 1);
          store('mizan-goals', all);
          renderGoals();
          toast('Goal removed');
        });
      });
    }

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
          var goals = store('mizan-goals') || [];
          goals.push({ name: name, type: $('#mz-goal-type', o).value, target: target, current: parseInt($('#mz-goal-current', o).value, 10) || 0 });
          store('mizan-goals', goals);
          renderGoals();
          toast('Goal created 🎯');
        },
        'Create goal');
    }

    $all('[data-new-goal]').forEach(function (b) { b.addEventListener('click', goalModal); });
    var goalTabs = $('#goal-tabs');
    if (goalTabs) goalTabs.addEventListener('tabchange', function (e) { goalFilter = e.detail; renderGoals(); });
    renderGoals();
  }

  /* ─── 6. Radar page ───────────────────────────────────── */
  var radarCreate = $('#radar-create');
  if (radarCreate) {
    function renderRadars() {
      var list = $('#radar-list');
      var radars = store('mizan-radars') || [];
      if (!list) return;
      list.innerHTML = '';
      if (!radars.length) { list.innerHTML = '<div class="empty" style="padding:1rem;"><p>No radars yet — create one on the right.</p></div>'; return; }
      radars.forEach(function (r, i) {
        var row = document.createElement('div');
        row.className = 'row-item';
        row.innerHTML = '<div><div class="row-main">' + r.text + '</div><div class="row-sub">' + r.freq + ' · ' + r.time + ' AEST · ' + r.notify.join(' + ') + '</div></div>' +
          '<button class="icon-btn" data-del-radar="' + i + '" title="Delete">✕</button>';
        list.appendChild(row);
      });
      $all('[data-del-radar]').forEach(function (b) {
        b.addEventListener('click', function () {
          var all = store('mizan-radars') || [];
          all.splice(parseInt(b.getAttribute('data-del-radar'), 10), 1);
          store('mizan-radars', all);
          renderRadars();
          toast('Radar deleted');
        });
      });
    }

    radarCreate.addEventListener('click', function () {
      var text = ($('#radar-text') || {}).value || '';
      text = text.trim();
      if (!text) { toast('Describe what Mizan should watch'); $('#radar-text').focus(); return; }
      var freqTab = $('#radar-freq .tab.active');
      var notify = [];
      if (($('#radar-email') || {}).checked) notify.push('email');
      if (($('#radar-sms') || {}).checked) notify.push('SMS');
      var radars = store('mizan-radars') || [];
      radars.push({
        text: text,
        freq: freqTab ? freqTab.textContent.trim() : 'Daily',
        time: ($('#radar-time') || {}).value || '09:00',
        notify: notify.length ? notify : ['email']
      });
      store('mizan-radars', radars);
      $('#radar-text').value = '';
      renderRadars();
      toast('Radar created 📡 — it will run on schedule');
    });

    $all('[data-radar-template]').forEach(function (row) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        $('#radar-text').value = row.getAttribute('data-radar-template');
        $('#radar-text').focus();
        toast('Template loaded — tweak it and hit Create');
      });
    });

    renderRadars();
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

  /* Ask Mizan page */
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

  /* ─── 8. Research page ────────────────────────────────── */
  var researchRun = $('#research-run');
  if (researchRun) {
    function renderResearch() {
      var listEl = $('#research-history');
      var items = store('mizan-research') || [];
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!items.length) { listEl.innerHTML = '<div class="empty" style="padding:1.2rem 0.5rem;"><p>No research yet. Your completed reports will appear here.</p></div>'; return; }
      items.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'row-item';
        row.innerHTML = '<div><div class="row-main">' + r.q + '</div><div class="row-sub">' + r.when + '</div></div><span class="chip chip-warn">Queued</span>';
        listEl.appendChild(row);
      });
    }
    researchRun.addEventListener('click', function () {
      var input = $('#research-input');
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      var items = store('mizan-research') || [];
      items.unshift({ q: text, when: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' · ~40 min' });
      store('mizan-research', items);
      input.value = '';
      renderResearch();
      toast('Research queued 🔬 — you\'ll get an email when it\'s ready');
    });
    $('#research-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); researchRun.click(); }
    });
    $all('[data-research-suggest]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#research-input').value = b.textContent.trim();
        $('#research-input').focus();
      });
    });
    renderResearch();
  }

  /* ─── 9. Vault + transactions file uploads (demo) ─────── */
  $all('[data-dropzone]').forEach(function (zone) {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.csv,.docx,.png,.jpg,.jpeg';
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
      var key = zone.getAttribute('data-dropzone') === 'vault' ? 'mizan-vault' : 'mizan-statements';
      var stored = store(key) || [];
      Array.prototype.forEach.call(files, function (f) {
        stored.unshift({ name: f.name, size: Math.round(f.size / 1024) + ' KB', when: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) });
      });
      store(key, stored);
      renderUploads(key);
      toast(files.length + ' file' + (files.length > 1 ? 's' : '') + ' added (demo) — parsing coming soon');
    }
  });

  function renderUploads(key) {
    var listEl = $('[data-uploads="' + (key === 'mizan-vault' ? 'vault' : 'statements') + '"]');
    if (!listEl) return;
    var items = store(key) || [];
    if (!items.length) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = '<div class="panel-title" style="margin-top:1rem;">Uploaded documents</div>' + items.map(function (f, i) {
      return '<div class="row-item"><div><div class="row-main">📄 ' + f.name + '</div><div class="row-sub">' + f.size + ' · ' + f.when + '</div></div><span class="chip chip-accent">Stored</span></div>';
    }).join('');
  }
  renderUploads('mizan-vault');
  renderUploads('mizan-statements');

  /* ─── 10. Settings: switches persist + delete account ─── */
  if (location.pathname.indexOf('/dashboard/settings') === 0) {
    $all('.switch input').forEach(function (sw, i) {
      if (sw.id === 'tfa-switch') return; // server-backed, handled below
      var key = 'mizan-pref-' + i;
      var saved = store(key);
      if (saved !== null) sw.checked = saved;
      sw.addEventListener('change', function () {
        store(key, sw.checked);
        toast(sw.checked ? 'Notification on' : 'Notification off');
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

  /* ─── 11. Profile: autosave non-DB fields locally ─────── */
  if (location.pathname.indexOf('/dashboard/profile') === 0) {
    $all('.panel .field input, .panel .field select, .panel .field textarea').forEach(function (el, i) {
      if (el.closest('form')) return; // name form posts to the server
      var key = 'mizan-profile-' + i;
      var saved = store(key);
      if (saved !== null && saved !== '' && !el.disabled) {
        if (el.type === 'checkbox') el.checked = saved; else el.value = saved;
      }
      el.addEventListener('change', function () {
        store(key, el.type === 'checkbox' ? el.checked : el.value);
        toast('Saved');
      });
    });
  }

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

  /* ─── 15. Misc demo buttons ───────────────────────────── */
  $all('[data-demo-soon]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      toast(b.getAttribute('data-demo-soon'));
    });
  });
})();

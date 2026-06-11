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

  /* ─── 2. Dashboard time-range tabs ────────────────────── */
  var rangeTabs = $('#range-tabs');
  if (rangeTabs) {
    var deltas = {
      '1M':  '+0.8% this month',
      '6M':  '+1.9% past 6 months',
      'YTD': '+2.4% this quarter',
      'All': '+6.2% since you joined'
    };
    rangeTabs.addEventListener('tabchange', function (e) {
      var range = e.detail;
      $all('.range-chip').forEach(function (c) { c.textContent = range; });
      var d = $('[data-networth-delta]');
      if (d && d.classList.contains('up')) d.textContent = deltas[range] || d.textContent;
    });
  }

  /* ─── 3. Add asset / liability (persists to profile) ──── */
  var ASSET_FIELDS = {
    super_balance:        'Superannuation',
    investment_portfolio: 'Investments (shares, ETFs, crypto, cash)',
    property_value:       'Property',
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

  /* ─── 4. Institution tiles (Basiq demo connect) ───────── */
  $all('.inst').forEach(function (tile) {
    tile.addEventListener('click', function () {
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

  /* ─── 7. Ask Mizan page ───────────────────────────────── */
  var askSend = $('#ask-send');
  if (askSend) {
    var askThread = $('#ask-thread');
    function askReply(text) {
      var me = document.createElement('div');
      me.className = 'chat-msg me';
      me.textContent = text;
      askThread.appendChild(me);
      askThread.style.display = 'flex';
      setTimeout(function () {
        var bot = document.createElement('div');
        bot.className = 'chat-msg bot';
        bot.textContent = 'Good question. Mizan chat is in preview — once your accounts are connected I\'ll answer this from your real data. For now: add assets & liabilities so I can see your full picture.';
        askThread.appendChild(bot);
        bot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 650);
    }
    askSend.addEventListener('click', function () {
      var input = $('#ask-input');
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      input.value = '';
      askReply(text);
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
        fetch('/api/account/delete', { method: 'POST' }).then(function () { window.location.href = '/'; });
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

  /* ─── 12. Misc demo buttons ───────────────────────────── */
  $all('[data-demo-soon]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      toast(b.getAttribute('data-demo-soon'));
    });
  });
})();

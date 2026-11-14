(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let leads = [];
  let current = null;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // An open tab reloads itself when a new version is deployed, so nobody keeps using stale code.
  const APP_VERSION = '1.11.1';
  async function checkVersion() {
    try {
      const v = (await (await fetch(`/version.txt?t=${Date.now()}`, { cache: 'no-store' })).text()).trim();
      if (v && v !== APP_VERSION && !document.querySelector('#sendBox:not([hidden])')) location.reload();
    } catch { /* offline: try later */ }
  }
  setInterval(checkVersion, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('signed_out'); }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'request_failed'), { body });
    return body;
  }

  const avatar = (m) => m.picture
    ? `<img src="${esc(m.picture)}" alt="" />`
    : `<span class="avatar">${esc((m.name || m.email || '?').trim().charAt(0).toUpperCase())}</span>`;

  // ---------- Views ----------
  const titles = { leads: 'Leads', quick: 'New talking point', profile: 'My profile', settings: 'Settings' };
  function show(view) {
    if (!titles[view]) view = 'leads';
    for (const v of Object.keys(titles)) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    $('pageTitle').textContent = titles[view];
    document.title = `${titles[view]} · Talking Points`;
    $('sidebar').classList.remove('open');
    if (view === 'settings') { loadSettings(); loadTemplate(); }
    if (view === 'quick') loadQuick();
  }
  window.addEventListener('hashchange', route);
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (/^quick:\d+$/.test(h)) { show('quick'); openQuick(h.slice(6)); return; }
    if (h && !titles[h]) { show('leads'); openLead(h); return; }   // any other hash is a Streak box key
    show(h || 'leads');
  }

  // ---------- Leads ----------
  let scheduledOnly = false;
  function renderList() {
    const q = $('filter').value.trim().toLowerCase();
    const items = leads.filter((l) => !q || `${l.company} ${l.brief?.lead_name || ''}`.toLowerCase().includes(q));
    if (!items.length) {
      $('leadList').innerHTML = `<p style="color:var(--text-muted)">${leads.length ? 'No lead matches that filter.' : (scheduledOnly ? 'No call scheduled yet. A lead appears here, with its talking points, once it reaches the “Scheduled” stage in Streak.' : 'No leads in your pipeline yet. They appear here as soon as our team adds them.')}</p>`;
      return;
    }
    $('leadList').innerHTML = items.map((l) => {
      const b = l.brief;
      const status = b ? `<span class="tag ${b.status === 'ready' ? 'ready' : 'draft'}">${b.status === 'ready' ? 'Talking points ready' : 'Draft'}</span>` : '<span class="tag">Research in progress</span>';
      const added = l.created ? new Date(l.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `<button class="lead" role="listitem" data-box="${esc(l.box_key)}" aria-current="${l.box_key === current}">
        <div class="co">${esc(l.company)}</div>
        <div class="who">${esc(b?.lead_name || '')}${b?.lead_role ? ` · ${esc(b.lead_role)}` : ''}</div>
        <div class="meta">${status}${l.stage ? `<span class="tag">${esc(l.stage)}</span>` : ''}${added ? `<span class="tag">Added ${esc(added)}</span>` : ''}</div>
      </button>`;
    }).join('');
  }
  $('leadList').addEventListener('click', (e) => {
    const b = e.target.closest('.lead');
    if (b) location.hash = encodeURIComponent(b.dataset.box);
  });
  $('filter').addEventListener('input', renderList);

  async function openLead(box) {
    current = box;
    renderList();
    const pane = $('briefPane');
    pane.innerHTML = '<div class="empty"><p>Loading talking points…</p></div>';
    try {
      const { brief } = await api(`/api/leads/${encodeURIComponent(box)}`);
      if (brief) { showBrief(brief); return; }
      const lead = leads.find((l) => l.box_key === box);
      pane.innerHTML = `<div class="empty"><h3>No talking points for ${esc(lead?.company || 'this lead')} yet</h3>
        <p>Gershon is researching this lead. The talking points appear here as soon as they are ready.</p></div>`;
    } catch (e) {
      pane.innerHTML = '<div class="empty"><h3>Could not load this lead</h3><p>Refresh the page to try again.</p></div>';
    }
  }

  // ---------- Send log: when this talking point was emailed, to whom, and whether it went out ----------
  const sendUrl = (brief) => brief.quick ? `/api/quick/${brief.id}/send` : `/api/leads/${encodeURIComponent(brief.box_key)}/send`;
  async function loadSendLog(brief) {
    const el = $('sendLog'); if (!el) return;
    let h = [];
    try { h = (await api(sendUrl(brief))).history || []; } catch { /* no log */ }
    const fmt = (t) => new Date(t.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    el.innerHTML = h.length
      ? `<div class="muted" style="font-size:12px;margin:6px 0 10px"><b>Send log</b><ul style="margin:4px 0 0 18px;padding:0">${h.map((x) => `<li>${esc(fmt(x.created_at))} · ${x.status === 'sent' ? '✅ sent' : '❌ failed'} to ${esc(x.to_list)} · by ${esc(x.sent_by)}${x.error ? ` · <span title="${esc(x.error)}">${esc(x.error.slice(0, 80))}</span>` : ''}</li>`).join('')}</ul></div>`
      : '<div class="muted" style="font-size:12px;margin:6px 0 10px">Not emailed yet.</div>';
  }

  // ---------- Brief toolbar: download + send ----------
  let shown = null;
  function showBrief(brief, paneId = 'briefPane') {
    shown = brief;
    $('briefPane').innerHTML = ''; $('quickPane').innerHTML = '';
    $(paneId).innerHTML = `<div class="brief-tools">${brief.quick ? '<button class="btn" id="quickDel">Delete</button>' : ''}
        <button class="btn" id="dlPdf">Download PDF</button>
        <button class="btn" id="dlHtml">Download HTML</button>
        <button class="btn primary" id="sendOpen">Send by email</button>
      </div>
      <form class="send-box" id="sendBox" hidden>
        <label for="sendTo">Send to</label><input id="sendTo" type="text" placeholder="name@company.com, colleague@company.com" />
        <label for="sendNote">Message (optional)</label><textarea id="sendNote" placeholder="A line to go above the talking points"></textarea>
        <div class="row-actions"><button class="btn primary" type="submit" id="sendGo">Send now</button><button class="btn" type="button" id="sendCancel">Cancel</button></div>
      </form>
      <div class="send-log" id="sendLog"></div>
      <div id="briefDoc">${brief.html}</div>`;
    loadSendLog(brief);
    if (brief.quick) $('quickDel').onclick = async () => {
      if (!confirm('Delete this quick talking point?')) return;
      try { await api(`/api/quick/${brief.id}`, { method: 'DELETE' }); toast('Deleted'); location.hash = '#quick'; loadQuick(); resetQuickPane(); } catch { toast('Not deleted. Try again.'); }
    };
    const name = `Talking Points - ${brief.company || 'lead'} - ${brief.lead_name || ''}`.replace(/[\\/:*?"<>|]+/g, '').trim();
    $('dlHtml').onclick = () => {
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(name)}</title></head><body style="margin:0">${brief.html}</body></html>`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
      a.download = `${name}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('dlPdf').onclick = async () => {
      const btn = $('dlPdf'); btn.disabled = true; btn.textContent = 'Preparing PDF…';
      try {
        if (!window.html2pdf) throw new Error('pdf');
        await window.html2pdf().set({ margin: [6, 6, 6, 6], filename: `${name}.pdf`, image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' }, pagebreak: { mode: ['css', 'legacy'] } })
          .from($('briefDoc')).save();
      } catch { toast('The PDF could not be made. Use Download HTML instead.'); }
      btn.disabled = false; btn.textContent = 'Download PDF';
    };
    $('sendOpen').onclick = async () => {
      $('sendBox').hidden = false;
      try { const s = await api(sendUrl(brief)); if (!$('sendTo').value) $('sendTo').value = s.suggested; } catch { /* keep empty */ }
      $('sendTo').focus();
    };
    $('sendCancel').onclick = () => { $('sendBox').hidden = true; };
    $('sendBox').onsubmit = async (e) => {
      e.preventDefault();
      const go = $('sendGo'); go.disabled = true; go.textContent = 'Sending…';
      try {
        const r = await api(sendUrl(brief), { method: 'POST', body: JSON.stringify({ to: $('sendTo').value, note: $('sendNote').value }) });
        toast(`Sent to ${r.sent_to.length} ${r.sent_to.length === 1 ? 'person' : 'people'}`); $('sendBox').hidden = true;
      } catch (err) { toast(err.body?.error || 'Not sent. Try again.'); }
      loadSendLog(brief);
      go.disabled = false; go.textContent = 'Send now';
    };
  }

  async function makeDraft(box) {
    const btn = $('makeDraft');
    btn.disabled = true; btn.textContent = 'Creating draft…';
    try {
      const { brief } = await api(`/api/leads/${encodeURIComponent(box)}`, { method: 'POST' });
      showBrief(brief);
      const l = leads.find((x) => x.box_key === box);
      if (l) l.brief = { status: brief.status, lead_name: brief.lead_name, lead_role: brief.lead_role };
      renderList();
      toast('Draft created');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Create draft';
      if (e.body?.error === 'wrong_client') { toast(e.body.detail || 'This lead belongs to another campaign.'); setTimeout(() => location.reload(), 2500); return; }
      toast('Draft could not be created. Try again in a minute.');
    }
  }

  // ---------- Quick talking point (website or professional email → Cloudflare Workers AI) ----------
  let quickItems = [];
  const resetQuickPane = () => { $('quickPane').innerHTML = '<div class="empty"><h3>Your quick talking point appears here</h3><p>Paste a website or a professional email above.</p></div>'; };
  function renderQuickList() {
    const cur = decodeURIComponent(location.hash.slice(1));
    $('quickList').innerHTML = quickItems.length ? quickItems.map((q) => {
      const when = new Date(q.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<button class="lead" role="listitem" data-q="${q.id}" aria-current="${cur === `quick:${q.id}`}">
        <div class="co">${esc(q.company || q.domain)}</div>
        <div class="who">${esc(q.lead_name || '')}${q.lead_role ? ` · ${esc(q.lead_role)}` : ''}</div>
        <div class="meta"><span class="tag draft">Quick</span><span class="tag">${esc(q.kind === 'email' ? 'From email' : 'From website')}</span><span class="tag">${esc(when)}</span></div>
      </button>`;
    }).join('') : '<p style="color:var(--text-muted)">None yet.</p>';
  }
  async function loadQuick() {
    try { quickItems = (await api('/api/quick')).items || []; } catch { quickItems = []; }
    renderQuickList();
  }
  async function openQuick(id) {
    $('quickPane').innerHTML = '<div class="empty"><p>Loading…</p></div>';
    try { const { brief } = await api(`/api/quick/${id}`); showBrief(brief, 'quickPane'); }
    catch { $('quickPane').innerHTML = '<div class="empty"><h3>This quick talking point could not be loaded</h3></div>'; }
    renderQuickList();
  }
  $('quickList').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) location.hash = `quick:${b.dataset.q}`; });
  $('quickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('quickInput').value.trim();
    if (!input) { $('quickInput').focus(); return; }
    const go = $('quickGo'); go.disabled = true; go.textContent = 'Reading the website…';
    $('quickPane').innerHTML = '<div class="empty"><h3>Building your talking point…</h3><p>Reading the website and asking Cloudflare AI. This takes about 20 seconds.</p></div>';
    const t = setTimeout(() => { go.textContent = 'Writing the talking point…'; }, 6000);
    try {
      const { brief } = await api('/api/quick', { method: 'POST', body: JSON.stringify({ input }) });
      $('quickInput').value = '';
      history.replaceState(null, '', `#quick:${brief.id}`);
      showBrief(brief, 'quickPane');
      await loadQuick();
      toast('Talking point ready');
    } catch (err) {
      $('quickPane').innerHTML = `<div class="empty"><h3>No talking point</h3><p>${esc(err.body?.error || 'Something went wrong. Try again in a minute.')}</p></div>`;
    }
    clearTimeout(t); go.disabled = false; go.textContent = 'Create talking point';
  });

  // ---------- Profile & team ----------
  let me = null;
  function fillProfile() {
    $('idAvatar').innerHTML = avatar(me.member);
    $('idName').textContent = me.member.name || '';
    $('idEmail').textContent = me.member.email || '';
    $('idCompany').textContent = me.client.name || '';
    $('pTitle').value = me.member.title || '';
    $('pLinkedin').value = me.member.linkedin_url || '';
    $('pBackground').value = me.member.background || '';
    $('pNotify').checked = !!me.member.notify;
  }
  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me', {
        method: 'PUT',
        body: JSON.stringify({ title: $('pTitle').value, linkedin_url: $('pLinkedin').value, background: $('pBackground').value, notify: $('pNotify').checked }),
      });
      toast('Profile saved');
    } catch { toast('Profile not saved. Check your connection and try again.'); }
  });


  // ---------- Settings ----------
  let settings = null;
  async function loadSettings() {
    try { settings = await api('/api/settings'); } catch { toast('Settings could not be loaded.'); return; }
    const st = settings;
    const locked = !st.can_manage;
    $('settingsNote').hidden = !locked;
    document.querySelectorAll('#view-settings input, #view-settings select, #view-settings textarea, #view-settings button').forEach((el) => { if (!el.closest('#templateForm')) el.disabled = locked; });
    document.querySelectorAll('#emailForm textarea, #emailForm button').forEach((el) => { el.disabled = false; });

    $('streakStatus').textContent = st.streak.connected ? `Connected (key ends ${st.streak.hint})` : 'Not connected';
    $('streakStatus').className = `tag ${st.streak.valid ? 'ready' : st.streak.connected ? 'draft' : ''}`;
    $('sRemove').hidden = !st.streak.connected;
    $('sPipeline').innerHTML = st.streak.pipelines.length
      ? `<option value="">Choose a pipeline</option>${st.streak.pipelines.map((p) => `<option value="${esc(p.key)}" ${p.key === st.streak.pipeline_key ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`
      : '<option value="">Connect Streak to list your pipelines</option>';

    // Direct link to the client's dedicated Streak pipeline (set by Gershon or chosen above).
    const pk = st.streak.pipeline_key && !st.streak.pipeline_key.startsWith('pipeline:') ? st.streak.pipeline_key : '';
    const pUrl = pk ? `https://www.streak.com/a/pipelines/${pk}` : '';
    $('sPipeLinkBox').hidden = !pUrl;
    $('sPipeNone').hidden = !!pUrl;
    if (pUrl) { $('sPipeLink').href = pUrl; $('sPipeUrl').textContent = pUrl; }

    $('sRecipients').value = st.recipients || ''; // empty means nobody yet — no pre-filled address that only looks saved
  }

  // ---------- Talking points template ----------
  async function loadTemplate() {
    let t;
    try { t = await api('/api/template'); } catch { $('tplList').innerHTML = '<li class="muted">The template could not be loaded.</li>'; return; }
    const locked = !t.can_manage;
    $('tplList').innerHTML = t.sections.map((s) => `<li class="${s.on ? '' : 'off'}">
      <input type="checkbox" data-sec="${esc(s.id)}" ${s.on ? 'checked' : ''} ${s.required || locked ? 'disabled' : ''} aria-label="${esc(s.label)}" />
      <div class="tpl-main"><b>${esc(s.label)}${s.required ? ' <span>(always included)</span>' : ''}</b><span>${esc(s.desc)}</span></div>
      <span class="tpl-src">${esc(s.source)}</span></li>`).join('');
    $('tCompany').value = t.company; $('tIcp').value = t.icp;
    $('tCompany').disabled = $('tIcp').disabled = locked;
    $('templateForm').querySelector('button').disabled = locked;
  }
  $('tplList').addEventListener('change', (e) => { const c = e.target.closest('[data-sec]'); if (c) c.closest('li').classList.toggle('off', !c.checked); });
  $('templateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const disabled = [...document.querySelectorAll('#tplList [data-sec]')].filter((c) => !c.checked).map((c) => c.dataset.sec);
    try { await api('/api/template', { method: 'PUT', body: JSON.stringify({ disabled, company: $('tCompany').value, icp: $('tIcp').value }) }); toast('Template saved'); if (current) openLead(current); }
    catch (err) { toast(err.body?.error || 'Template not saved. Try again.'); }
  });

  async function saveSettings(body, okMsg) {
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) }); toast(okMsg); loadSettings(); }
    catch (e) { toast(e.body?.error || 'Settings not saved. Try again.'); }
  }
  $('streakForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const body = { pipeline_key: $('sPipeline').value };
    if ($('sKey').value.trim()) body.streak_key = $('sKey').value.trim();
    $('sKey').value = '';
    saveSettings(body, 'Streak settings saved').then(() => loadLeads());
  });
  $('sRemove').addEventListener('click', () => saveSettings({ remove_streak: true }, 'Streak disconnected'));
  $('emailForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.submitter || $('emailForm').querySelector('button'); btn.disabled = true;
    api('/api/settings', { method: 'PUT', body: JSON.stringify({ recipients: $('sRecipients').value }) })
      .then((r) => { const n = (r.recipients || []).length; $('sRecipients').value = (r.recipients || []).join(', '); toast(n ? `Saved — talking points go to ${n} ${n === 1 ? 'person' : 'people'}` : 'Saved — nobody will receive talking points'); })
      .catch((err) => toast(err.body?.error || `Not saved (${err.message}). Try again.`))
      .finally(() => { btn.disabled = false; });
  });


  async function loadLeads() {
    try {
      const res = await api('/api/leads');
      leads = res.leads;
      scheduledOnly = !!res.scheduled_only;
      if (!res.streak_connected && !leads.length) {
        $('leadList').innerHTML = '<p style="color:var(--text-muted)">Connect Streak in <a href="#settings" style="color:var(--brand);font-weight:600">Settings</a> to see your leads here.</p>';
        return;
      }
      renderList();
    } catch { $('leadList').innerHTML = '<p style="color:var(--text-muted)">Your leads could not be loaded. Refresh to try again.</p>'; }
  }

  // ---------- Owner: User view / Admin view ----------
  // User view  = exactly what a client sees, on Olivier's own campaign (GC Pipeline), with his own profile.
  // Admin view = test any client campaign (picker), Admin link, red banner; "My profile" hidden so the
  //              owner's profile is never mixed with the campaign being tested.
  const VIEW_KEY = 'tp_view';
  const getMode = () => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } };
  const setMode = (m) => { try { localStorage.setItem(VIEW_KEY, m); } catch { /* storage off */ } };

  async function loadCampaignPicker() {
    try {
      const { clients } = await api('/api/admin/clients');
      const sel = $('campaignPick');
      sel.innerHTML = clients.map((c) => `<option value="${c.id}" ${c.slug === me.client.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      sel.hidden = false;
      sel.onchange = async () => {
        try { await api('/api/admin/view-as', { method: 'POST', body: JSON.stringify({ client_id: sel.value }) }); location.hash = ''; location.reload(); }
        catch (e) { toast(e.message || 'Could not switch campaign'); }
      };
    } catch { /* owner-only extra */ }
  }

  async function applyOwnerView() {
    const atHome = me.client.slug === me.home_slug;
    let mode = getMode() || (atHome ? 'user' : 'admin');
    if (mode === 'user' && !atHome) {
      // User view always shows the owner's own campaign.
      try { await api('/api/admin/view-as', { method: 'POST', body: JSON.stringify({ home: true }) }); location.reload(); return false; }
      catch { mode = 'admin'; }
    }
    setMode(mode);
    document.body.classList.toggle('mode-admin', mode === 'admin');
    const sw = $('viewSwitch');
    sw.hidden = false;
    sw.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.onclick = async () => {
        if (b.dataset.mode === mode) return;
        setMode(b.dataset.mode);
        if (b.dataset.mode === 'user' && !atHome) {
          try { await api('/api/admin/view-as', { method: 'POST', body: JSON.stringify({ home: true }) }); } catch (e) { toast(e.message || 'Could not switch view'); return; }
        }
        location.hash = ''; location.reload();
      };
    });
    if (mode === 'admin') {
      $('clientName').textContent = 'Testing campaign';
      document.querySelector('.nav-item[data-view="settings"]').insertAdjacentHTML('afterend', '<a class="nav-item" href="/admin">Admin</a>');
      document.querySelector('.nav-item[data-view="profile"]').hidden = true;
      if (location.hash === '#profile') location.hash = '#leads';
      $('topRight').insertAdjacentHTML('afterbegin', `<span class="admin-banner">Admin view · ${esc(me.client.name)}</span>`);
      loadCampaignPicker();
    }
    return true;
  }

  // ---------- Boot ----------
  (async function boot() {
    try { me = await api('/api/me'); } catch { return; }
    $('clientName').textContent = me.client.name;
    if (me.member.is_owner && !(await applyOwnerView())) return;
    $('userChip').innerHTML = `${avatar(me.member)}<div class="who"><b>${esc(me.member.name || me.member.email)}</b><span>${esc(me.member.title || me.member.email)}</span><br>
      <form method="post" action="/api/auth/logout" style="display:inline"><button class="linkish" type="submit">Sign out</button></form></div>`;
    fillProfile();
    route();
    loadLeads();
  })();
})();

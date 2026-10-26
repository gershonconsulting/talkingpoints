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
  const titles = { leads: 'Leads', profile: 'My profile', team: 'Team', settings: 'Settings' };
  function show(view) {
    if (!titles[view]) view = 'leads';
    for (const v of Object.keys(titles)) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    $('pageTitle').textContent = titles[view];
    document.title = `${titles[view]} · Talking Points`;
    $('sidebar').classList.remove('open');
    if (view === 'settings') loadSettings();
  }
  window.addEventListener('hashchange', route);
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('box:')) { show('leads'); openLead(h); return; }
    show(h || 'leads');
  }

  // ---------- Leads ----------
  function renderList() {
    const q = $('filter').value.trim().toLowerCase();
    const items = leads.filter((l) => !q || `${l.company} ${l.brief?.lead_name || ''}`.toLowerCase().includes(q));
    if (!items.length) {
      $('leadList').innerHTML = `<p style="color:var(--text-muted)">${leads.length ? 'No lead matches that filter.' : 'No leads in your pipeline yet. They appear here as soon as our team adds them.'}</p>`;
      return;
    }
    $('leadList').innerHTML = items.map((l) => {
      const b = l.brief;
      const status = b ? `<span class="tag ${b.status === 'ready' ? 'ready' : 'draft'}">${b.status === 'ready' ? 'Talking points ready' : 'Draft'}</span>` : '<span class="tag">No talking points yet</span>';
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
      if (brief) { pane.innerHTML = brief.html; return; }
      const lead = leads.find((l) => l.box_key === box);
      pane.innerHTML = `<div class="empty"><h3>No talking points for ${esc(lead?.company || 'this lead')} yet</h3>
        <p>Create a first draft now from your pipeline data. The full researched version replaces it when ready.</p>
        <button class="btn primary" id="makeDraft">Create draft</button></div>`;
      $('makeDraft').onclick = () => makeDraft(box);
    } catch (e) {
      pane.innerHTML = '<div class="empty"><h3>Could not load this lead</h3><p>Refresh the page to try again.</p></div>';
    }
  }

  async function makeDraft(box) {
    const btn = $('makeDraft');
    btn.disabled = true; btn.textContent = 'Creating draft…';
    try {
      const { brief } = await api(`/api/leads/${encodeURIComponent(box)}`, { method: 'POST' });
      $('briefPane').innerHTML = brief.html;
      const l = leads.find((x) => x.box_key === box);
      if (l) l.brief = { status: brief.status, lead_name: brief.lead_name, lead_role: brief.lead_role };
      renderList();
      toast('Draft created');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Create draft';
      toast('Draft could not be created. Try again in a minute.');
    }
  }

  // ---------- Profile & team ----------
  let me = null;
  function fillProfile() {
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

  function fillTeam() {
    if (!me.team.length) { $('teamGrid').innerHTML = '<p style="color:var(--text-muted)">No teammates yet. Gershon Consulting adds your team; each person then signs in with LinkedIn.</p>'; return; }
    $('teamGrid').innerHTML = me.team.map((m) => `<div class="member">${avatar(m)}<div><div class="n">${esc(m.name || 'Invited')}</div><div class="t">${esc(m.title || '')}${m.last_login_at ? '' : ' · not signed in yet'}</div></div></div>`).join('');
  }

  // ---------- Settings ----------
  let settings = null;
  async function loadSettings() {
    try { settings = await api('/api/settings'); } catch { toast('Settings could not be loaded.'); return; }
    const st = settings;
    const locked = !st.can_manage;
    $('settingsNote').hidden = !locked;
    document.querySelectorAll('#view-settings input, #view-settings select, #view-settings textarea, #view-settings button').forEach((el) => { el.disabled = locked; });

    $('streakStatus').textContent = st.streak.connected ? `Connected (key ends ${st.streak.hint})` : 'Not connected';
    $('streakStatus').className = `tag ${st.streak.valid ? 'ready' : st.streak.connected ? 'draft' : ''}`;
    $('sRemove').hidden = !st.streak.connected;
    $('sPipeline').innerHTML = st.streak.pipelines.length
      ? `<option value="">Choose a pipeline</option>${st.streak.pipelines.map((p) => `<option value="${esc(p.key)}" ${p.key === st.streak.pipeline_key ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`
      : '<option value="">Connect Streak to list your pipelines</option>';

    const cal = st.calendar;
    $('calStatus').textContent = cal.connected ? `Connected${cal.email ? ` as ${cal.email}` : ''}` : 'Not connected';
    $('calStatus').className = `tag ${cal.connected ? 'ready' : ''}`;
    if (!cal.available) {
      $('calBody').innerHTML = '<p class="muted" style="margin:0">Calendar connection is being set up by Gershon Consulting. It will appear here shortly.</p>';
    } else if (!cal.connected) {
      $('calBody').innerHTML = `<a class="btn primary" href="/api/google/start" ${locked ? 'aria-disabled="true" style="pointer-events:none;opacity:.5"' : ''}>Connect Google Calendar</a>`;
    } else {
      $('calBody').innerHTML = `<div class="field"><label for="sCal">Calendar to watch</label><select id="sCal">${(cal.calendars.length ? cal.calendars : [{ id: cal.calendar_id, name: cal.calendar_id }]).map((c) => `<option value="${esc(c.id)}" ${c.id === cal.calendar_id ? 'selected' : ''}>${esc(c.name)}${c.primary ? ' (main)' : ''}</option>`).join('')}</select></div>
        <div class="row-actions"><button class="btn primary" id="calSave" ${locked ? 'disabled' : ''}>Save calendar</button><button class="btn" id="calOff" ${locked ? 'disabled' : ''}>Disconnect Google Calendar</button></div>`;
      $('calSave').onclick = () => saveSettings({ calendar_id: $('sCal').value }, 'Calendar saved');
      $('calOff').onclick = () => saveSettings({ disconnect_google: true }, 'Google Calendar disconnected');
    }

    $('sRecipients').value = st.recipients;
    $('sHours').value = String(st.lead_hours);
    if (![...$('sHours').options].some((o) => o.value === String(st.lead_hours))) $('sHours').insertAdjacentHTML('beforeend', `<option value="${st.lead_hours}" selected>${st.lead_hours} hours</option>`);
  }

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
    saveSettings({ recipients: $('sRecipients').value, lead_hours: $('sHours').value }, 'Email settings saved');
  });

  // ---------- Meetings ----------
  async function loadMeetings() {
    try {
      const { meetings } = await api('/api/meetings');
      $('meetingsCard').hidden = !meetings.length;
      $('meetingsList').innerHTML = meetings.map((m) => {
        const when = new Date(m.starts_at.replace(' ', 'T') + (m.starts_at.endsWith('Z') ? '' : 'Z'));
        return `<div class="mtg" data-box="${esc(m.box_key)}"><div><div class="mtg-co">${esc(m.company || m.attendee)}</div><div class="who" style="color:var(--text-muted);font-size:12px">${esc(m.lead_name || m.attendee)} · ${esc(m.title)}</div></div>
          <div class="mtg-when">${when.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${m.sent_at ? ' · sent' : ''}</div></div>`;
      }).join('');
    } catch { /* optional block */ }
  }
  $('meetingsList').addEventListener('click', (e) => { const m = e.target.closest('.mtg'); if (m) location.hash = encodeURIComponent(m.dataset.box); });

  async function loadLeads() {
    try {
      const res = await api('/api/leads');
      leads = res.leads;
      if (!res.streak_connected && !leads.length) {
        $('leadList').innerHTML = '<p style="color:var(--text-muted)">Connect Streak in <a href="#settings" style="color:var(--brand);font-weight:600">Settings</a> to see your leads here.</p>';
        return;
      }
      renderList();
    } catch { $('leadList').innerHTML = '<p style="color:var(--text-muted)">Your leads could not be loaded. Refresh to try again.</p>'; }
  }

  // ---------- Boot ----------
  (async function boot() {
    try { me = await api('/api/me'); } catch { return; }
    $('clientName').textContent = me.client.name;
    if (me.member.is_owner) document.querySelector('.nav-item[data-view="settings"]').insertAdjacentHTML('afterend', '<a class="nav-item" href="/admin">Admin</a>');
    $('userChip').innerHTML = `${avatar(me.member)}<div class="who"><b>${esc(me.member.name || me.member.email)}</b><span>${esc(me.client.name)}</span><br>
      <form method="post" action="/api/auth/logout" style="display:inline"><button class="linkish" type="submit">Sign out</button></form></div>`;
    $('topRight').innerHTML = `<span class="tag">${esc(me.client.name)}</span>`;
    fillProfile();
    fillTeam();
    if (!me.member.background) toast('Add your background in My profile to get better matches');
    route();
    const g = new URLSearchParams(location.search).get('google');
    if (g) {
      const msg = { connected: 'Google Calendar connected', cancelled: 'Google Calendar was not connected', expired: 'That link expired. Try again.', failed: 'Google did not confirm the connection. Try again.', norefresh: 'Google did not grant lasting access. Disconnect the app in your Google account, then try again.', unavailable: 'Calendar connection is not available yet.' }[g];
      if (msg) toast(msg);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    loadMeetings();
    loadLeads();
  })();
})();

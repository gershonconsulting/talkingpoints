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
  const titles = { leads: 'Leads', profile: 'My profile', team: 'Team' };
  function show(view) {
    if (!titles[view]) view = 'leads';
    for (const v of Object.keys(titles)) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    $('pageTitle').textContent = titles[view];
    document.title = `${titles[view]} · Talking Points`;
    $('sidebar').classList.remove('open');
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

  // ---------- Boot ----------
  (async function boot() {
    try { me = await api('/api/me'); } catch { return; }
    $('clientName').textContent = me.client.name;
    $('userChip').innerHTML = `${avatar(me.member)}<div class="who"><b>${esc(me.member.name || me.member.email)}</b><span>${esc(me.client.name)}</span><br>
      <form method="post" action="/api/auth/logout" style="display:inline"><button class="linkish" type="submit">Sign out</button></form></div>`;
    $('topRight').innerHTML = `<span class="tag">${esc(me.client.name)}</span>`;
    fillProfile();
    fillTeam();
    if (!me.member.background) toast('Add your background in My profile to get better matches');
    route();
    try {
      ({ leads } = await api('/api/leads'));
      renderList();
    } catch { $('leadList').innerHTML = '<p style="color:var(--text-muted)">Your leads could not be loaded. Refresh to try again.</p>'; }
  })();
})();

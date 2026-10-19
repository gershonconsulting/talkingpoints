// Renders a brief (JSON) to email-safe HTML in the Gershon "Talking Points" format
// (modelled on "Talking Points : PEPperPRINT GmbH - Melisa Kellner - September 10, 2026").
// The same HTML is shown in the dashboard and sent by email.
//
// Brief JSON — every section is optional; empty sections are not rendered:
// {
//   header:     { company, person, role, when, location, chips:[{label, tone:'brand'|'warn'}],
//                 alert:{title, text}, source_line },
//   grade:      { letter, headline, detail, context },
//   snapshot:   [{ label, value, tone? }],
//   in_common:  { best_match:{ name, reason }, items:[ "…" ] },
//   lead_with:  [{ title, text, tone? }],
//   person:     { name, text },
//   company:    { text },
//   financials: { country, text },                 // only when public data exists
//   history:    { text },
//   social:     { rows:[{ channel, audience, recency, read, tone? }], note },
//   industry:   [{ title, text }],
//   talking_points: [ "…" ],
//   events:     [{ name, when_where, note, best? }],
//   attention:  [{ title, text }],
//   sources:    [{ used:true|false, text }],
//   footer:     "…"
// }
// Text fields accept a small subset of inline markup: **bold** and _italic_.

const C = {
  brand: '#FE1B04', ink: '#12232e', body: '#33475b', muted: '#6b7785', faint: '#8a97a5',
  chip: '#eef1f5', warn: '#b4690e', warnBg: '#fdf6ec', warnInk: '#5a4a2e', ok: '#1f7a4d', line: '#eaeef2',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Safe inline formatting: escape first, then **bold**, _italic_, line breaks.
const fmt = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])_(.+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
  .replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

const card = (inner, { border } = {}) =>
  `<div style="background:#ffffff;${border ? `border-left:5px solid ${border};` : ''}border-radius:4px;padding:20px 22px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">${inner}</div>`;
const label = (t, color = C.muted) =>
  `<div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${color};font-weight:700;margin-bottom:12px;">${esc(t)}</div>`;
const para = (t) => `<div style="font-size:13px;color:${C.body};line-height:1.7;">${fmt(t)}</div>`;
const has = (v) => v && (Array.isArray(v) ? v.length : typeof v === 'object' ? Object.values(v).some(Boolean) : String(v).trim());

export function renderBrief(d = {}) {
  const out = [];
  const h = d.header || {};

  // 1. Header
  {
    const chips = (h.chips || []).map((c) =>
      `<span style="display:inline-block;background:${C.chip};color:${c.tone === 'warn' ? C.warn : C.brand};font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;margin:0 6px 4px 0;">${esc(c.label)}</span>`).join('');
    out.push(card(
      `<div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${C.muted};font-weight:700;margin-bottom:8px;">Talking Points</div>
<div style="font-size:24px;font-weight:800;color:${C.ink};line-height:1.2;margin-bottom:4px;">${esc(h.company)}</div>
<div style="font-size:15px;color:${C.body};margin-bottom:12px;">${esc(h.person)}${h.role ? ` — ${esc(h.role)}` : ''}</div>
${h.when ? `<div style="font-size:14px;color:${C.ink};font-weight:600;">${esc(h.when)}</div>` : ''}
${h.location ? `<div style="font-size:13px;color:#5a6c7d;margin-top:3px;">${esc(h.location)}</div>` : ''}
${chips ? `<div style="margin-top:12px;">${chips}</div>` : ''}
${has(h.alert) ? `<div style="margin-top:14px;padding:10px 12px;background:${C.warnBg};border-left:3px solid ${C.warn};font-size:13px;color:${C.warnInk};line-height:1.5;"><strong style="color:${C.warn};">${esc(h.alert.title)}</strong> ${fmt(h.alert.text)}</div>` : ''}
${h.source_line ? `<div style="margin-top:10px;font-size:12px;color:${C.muted};">${fmt(h.source_line)}</div>` : ''}`,
      { border: C.brand }));
  }

  // 2. Social network effectiveness grade
  if (has(d.grade)) {
    const g = d.grade;
    out.push(card(`${label('Social Network Effectiveness Grade')}
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
<td style="width:78px;vertical-align:top;"><div style="background:${C.chip};border-radius:8px;text-align:center;padding:12px 0;"><span style="font-size:38px;font-weight:800;color:${C.brand};line-height:1;">${esc(g.letter)}</span></div></td>
<td style="padding-left:16px;vertical-align:top;">
<div style="font-size:15px;font-weight:700;color:${C.ink};line-height:1.4;margin-bottom:8px;">${fmt(g.headline)}</div>
${g.detail ? `<div style="font-size:13px;color:${C.body};line-height:1.6;">${fmt(g.detail)}</div>` : ''}
<div style="font-size:11px;color:${C.faint};margin-top:10px;font-style:italic;line-height:1.5;">Scale: A+ six-figure audiences across several networks with constant publishing · A/A− strong on the networks that matter for the sector · B+/B/B− one standout channel or modest reach across several · C+/C/C− small audiences, sporadic or stale · D little or no meaningful presence.${g.context ? ` ${esc(g.context)}` : ''}</div>
</td></tr></table>`));
  }

  // 3. Snapshot
  if (has(d.snapshot)) {
    const rows = d.snapshot.map((r) =>
      `<tr><td style="padding:5px 0;width:130px;color:${C.muted};font-weight:600;vertical-align:top;">${esc(r.label)}</td><td style="padding:5px 0;${r.tone === 'warn' ? `color:${C.warn};font-weight:700;` : ''}">${fmt(r.value)}</td></tr>`).join('');
    out.push(card(`${label('Snapshot')}<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;color:${C.body};line-height:1.6;">${rows}</table>`));
  }

  // 4. What you have in common (client version)
  if (has(d.in_common)) {
    const ic = d.in_common;
    out.push(card(`${label('What you have in common', C.brand)}
${has(ic.best_match) ? `<div style="font-size:14px;font-weight:700;color:${C.ink};margin-bottom:10px;">Best placed to reach out: ${esc(ic.best_match.name)}</div>${ic.best_match.reason ? `<div style="font-size:13px;color:${C.body};line-height:1.6;margin:-6px 0 12px;">${fmt(ic.best_match.reason)}</div>` : ''}` : ''}
${(ic.items || []).map((t) => `<div style="font-size:13px;color:${C.body};line-height:1.6;margin-bottom:8px;padding-left:14px;border-left:3px solid ${C.brand};">${fmt(t)}</div>`).join('')}`));
  }

  // 5. Lead with this
  if (has(d.lead_with)) {
    out.push(card(`${label('Lead with this', C.brand)}${d.lead_with.map((p, i, a) =>
      `<div style="${i < a.length - 1 ? 'margin-bottom:14px;' : ''}padding-left:14px;border-left:3px solid ${p.tone === 'warn' ? C.warn : C.brand};">
<div style="font-size:14px;font-weight:700;color:${C.ink};margin-bottom:4px;">${i + 1}. ${fmt(p.title)}</div>
<div style="font-size:13px;color:${C.body};line-height:1.6;">${fmt(p.text)}</div></div>`).join('')}`));
  }

  // 6–9. Prose sections
  if (has(d.person)) out.push(card(`${label(`The person${d.person.name ? ` — ${d.person.name}` : ''}`)}${para(d.person.text)}`));
  if (has(d.company)) out.push(card(`${label('The company')}${para(d.company.text)}`));
  if (has(d.financials) && d.financials.text) out.push(card(`${label(`Financials & ownership${d.financials.country ? ` (${d.financials.country})` : ''}`)}${para(d.financials.text)}`));
  if (has(d.history)) out.push(card(`${label('Previous conversation')}${para(d.history.text)}`));

  // 10. LinkedIn & social intelligence
  if (has(d.social) && has(d.social.rows)) {
    const th = (t) => `<th align="left" style="padding:8px 8px;font-weight:700;color:${C.ink};border-bottom:1px solid #d9dfe6;">${t}</th>`;
    const td = (t, warn) => `<td style="padding:8px;border-bottom:1px solid ${C.line};vertical-align:top;">${warn ? `<span style="color:${C.warn};font-weight:700;">${fmt(t)}</span>` : fmt(t)}</td>`;
    out.push(card(`${label('LinkedIn & social intelligence')}
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;color:${C.body};">
<tr style="background:${C.chip};">${th('Channel')}${th('Audience')}${th('Volume / recency')}${th('Read')}</tr>
${d.social.rows.map((r) => `<tr><td style="padding:8px;border-bottom:1px solid ${C.line};vertical-align:top;"><strong>${esc(r.channel)}</strong></td>${td(r.audience)}${td(r.recency, r.tone === 'warn')}${td(r.read)}</tr>`).join('')}
</table>${d.social.note ? `<div style="font-size:12px;color:#5a6c7d;line-height:1.6;margin-top:12px;">${fmt(d.social.note)}</div>` : ''}`));
  }

  // 11. Industry pulse
  if (has(d.industry)) {
    out.push(card(`${label('Industry pulse')}${d.industry.map((s, i, a) =>
      `<div style="font-size:13px;font-weight:700;color:${C.ink};margin-bottom:5px;">${fmt(s.title)}</div><div style="font-size:13px;color:${C.body};line-height:1.7;${i < a.length - 1 ? 'margin-bottom:14px;' : ''}">${fmt(s.text)}</div>`).join('')}`));
  }

  // 12. Talking points
  if (has(d.talking_points)) {
    out.push(card(`${label('Suggested talking points & questions', C.brand)}<div style="font-size:13px;color:${C.body};line-height:1.9;">${d.talking_points.map((t) => `• ${fmt(t)}`).join('<br>')}</div>`));
  }

  // 13. Events
  if (has(d.events)) {
    out.push(card(`${label('Next important US events')}<div style="font-size:13px;color:${C.body};line-height:1.8;">${d.events.map((e) =>
      `<strong>${esc(e.name)}</strong>${e.when_where ? ` — ${esc(e.when_where)}` : ''}${e.best ? ` · <span style="color:${C.brand};font-weight:700;">best fit</span>` : ''}${e.note ? ` ${fmt(e.note)}` : ''}`).join('<br>')}</div>`));
  }

  // 14. Needs your attention
  if (has(d.attention)) {
    out.push(card(`${label('Needs your attention', C.warn)}<div style="font-size:13px;color:${C.body};line-height:1.8;">${d.attention.map((a, i) =>
      `<strong>${i + 1}. ${fmt(a.title)}</strong>${a.text ? ` ${fmt(a.text)}` : ''}`).join('<br>')}</div>`, { border: C.warn }));
  }

  // 15. Sources
  if (has(d.sources) || d.footer) {
    out.push(`<div style="background:#ffffff;border-radius:4px;padding:16px 22px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
${label('Sources')}<div style="font-size:12px;color:${C.body};line-height:1.9;">${(d.sources || []).map((s) =>
      s.used ? `<span style="color:${C.ok};font-weight:700;">✓</span> &nbsp;${fmt(s.text)}` : `<span style="color:${C.faint};">○</span> &nbsp;<span style="color:${C.faint};">${fmt(s.text)}</span>`).join('<br>')}</div>
<div style="font-size:11px;color:${C.faint};margin-top:12px;border-top:1px solid ${C.line};padding-top:10px;">${esc(d.footer || 'Gershon Consulting · Talking Points')}</div></div>`);
  }

  return `<div style="margin:0;padding:20px 12px;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="max-width:680px;margin:0 auto;">${out.join('\n')}</div></div>`;
}

// Plain-text version for the email's text part.
export function renderBriefText(d = {}) {
  const h = d.header || {};
  const lines = [`TALKING POINTS — ${h.company || ''}`, `${h.person || ''}${h.role ? `, ${h.role}` : ''}`];
  if (h.alert?.title) lines.push(`${h.alert.title} ${h.alert.text || ''}`);
  if (d.in_common?.best_match?.name) lines.push('', `BEST PLACED TO REACH OUT: ${d.in_common.best_match.name}`);
  if (d.in_common?.items?.length) lines.push('', 'WHAT YOU HAVE IN COMMON', ...d.in_common.items.map((t) => `- ${t}`));
  if (d.lead_with?.length) lines.push('', 'LEAD WITH THIS', ...d.lead_with.map((p, i) => `${i + 1}. ${p.title} ${p.text}`));
  if (d.talking_points?.length) lines.push('', 'KEY QUESTIONS', ...d.talking_points.map((t) => `- ${t}`));
  if (d.attention?.length) lines.push('', 'NEEDS YOUR ATTENTION', ...d.attention.map((a, i) => `${i + 1}. ${a.title} ${a.text || ''}`));
  return lines.join('\n').replace(/\*\*|(^|\s)_|_(\s|$)/g, '$1$2');
}

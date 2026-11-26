// Social Network Effectiveness Grade on EVERY talking point (Olivier, 2026-11-26: "All talking have a
// matching grade"). Researched briefs already carry a grade; the Cloudflare AI talking points and the quick
// ones had none. Scale (same as functions/_render.js): A+ six-figure audiences across several networks ·
// A/A- strong on the networks that matter · B+/B/B- one standout channel or modest reach · C+/C/C- small,
// sporadic or unchecked · D little or no presence.
// The grade is computed, never written by the AI: from the social channels the lead's website links to and,
// when the public page shows it, their follower count. Audiences that cannot be read are not guessed.

export const LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'];

// "12,345 followers" | "1.2K followers" | "3M subscribers" -> number
export function parseAudience(text = '') {
  const m = String(text).match(/([\d][\d.,\s]*)\s*([KkMm])?\+?\s*(followers|abonnés|subscribers|fans|likes)\b/);
  if (!m) return null;
  let n = m[1].replace(/\s/g, '');
  const mult = m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1;
  if (mult > 1) n = n.replace(',', '.');                 // "1,2K" -> 1.2
  else n = n.replace(/[.,](?=\d{3}\b)/g, '');            // "12,345" / "12.345" -> 12345
  const v = Math.round(parseFloat(n) * mult);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

const fmtN = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n));

// channels: [{ channel, url?, audience?: number|null }]
export function gradeFromChannels(channels = []) {
  const list = channels.filter((c) => c && c.channel);
  const known = list.filter((c) => Number.isFinite(c.audience));
  const total = known.reduce((s, c) => s + c.audience, 0);
  const top = known.reduce((m, c) => Math.max(m, c.audience), 0);
  const n = list.length;
  let letter;
  if (!n) letter = 'D';
  else if (known.length) {
    if (total >= 100000 && n >= 3) letter = 'A+';
    else if (total >= 100000) letter = 'A';
    else if (total >= 25000) letter = 'A-';
    else if (top >= 10000) letter = 'B+';
    else if (top >= 3000) letter = 'B';
    else if (top >= 1000) letter = 'B-';
    else letter = n >= 3 ? 'C+' : n === 2 ? 'C' : 'C-';
  } else letter = n >= 4 ? 'C+' : n === 3 ? 'C' : 'C-';

  const names = list.map((c) => (Number.isFinite(c.audience) ? `${c.channel} (${fmtN(c.audience)})` : c.channel));
  const headline = !n
    ? 'No social channel found for this company.'
    : known.length
      ? `${n} channel${n > 1 ? 's' : ''}, about **${fmtN(total)}** followers in total.`
      : `${n} channel${n > 1 ? 's' : ''} linked from the website; audiences not visible publicly.`;
  return {
    letter,
    headline,
    detail: n ? `Channels: ${names.join(', ')}.` : 'The website links to no LinkedIn, X, Facebook, Instagram, YouTube or TikTok page.',
    context: known.length === n && n ? '' : 'Computed automatically; check the audiences on LinkedIn before the call.',
    auto: true,
  };
}

async function fetchAudience(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; GershonTalkingPoints; +https://talkingpoints.gershon.ai)', accept: 'text/html' } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400000);
    const metas = [...html.matchAll(/<meta[^>]+content=["']([^"']{0,400})["']/gi)].map((m) => m[1]).join(' \n ');
    return parseAudience(metas) ?? parseAudience(html.replace(/<[^>]+>/g, ' ').slice(0, 200000));
  } catch { return null; }
}

// From the website reading (functions/_quick.js readWebsite → site.social).
export async function gradeSocial(social = [], { fetchFn = fetchAudience } = {}) {
  const chans = await Promise.all((social || []).slice(0, 6).map(async (s) => ({ ...s, audience: s.url ? await fetchFn(s.url) : null })));
  return gradeFromChannels(chans);
}

// For a brief saved without a grade: from its own social table, no network call (Monday backfill).
export function gradeFromBrief(data = {}) {
  const rows = data.social?.rows || [];
  return gradeFromChannels(rows.map((r) => ({ channel: r.channel, audience: parseAudience(`${r.audience || ''} followers`) })));
}

export const normLetter = (l) => String(l || '').trim().toUpperCase().replace(/[−–—]/g, '-');
export const hasGrade = (data) => !!(data && data.grade && LETTERS.includes(normLetter(data.grade.letter)));

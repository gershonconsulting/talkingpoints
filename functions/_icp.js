// ICP Match Grade (Olivier, 2026-11-26: "We need to grade the ICP match on top. This is the priority.").
// Every talking point opens with how well the lead fits the CLIENT's Ideal Customer Profile, on the same
// A+ … D scale as the Social Network Effectiveness Grade. The AI only judges each ICP criterion
// (met / partial / missed / unknown, with the evidence); the letter is computed here, so the same facts
// always give the same grade and the grade can be explained criterion by criterion.

import { GRADES } from './_research.js';

const STATUS = { met: 1, partial: 0.5, missed: 0, unknown: 0.25 };   // unknown is not rewarded as a fit
export const STATUS_MARK = { met: '✓', partial: '◐', missed: '✗', unknown: '?' };

const str = (x) => (typeof x === 'string' ? x.trim() : '');
export function normStatus(s) {
  const t = str(s).toLowerCase();
  if (/^(met|yes|match|fits?|true)/.test(t)) return 'met';
  if (/^(partial|partly|some)/.test(t)) return 'partial';
  if (/^(missed|no|not met|miss|fails?|false|mismatch)/.test(t)) return 'missed';
  return 'unknown';
}
const truthy = (v) => v === true || /^(true|yes|must)$/i.test(String(v || ''));

// Letter from a 0–1 score (A+ … D, no D+ / D−).
export function letterFor(score) {
  const cuts = [0.95, 0.85, 0.78, 0.7, 0.62, 0.55, 0.47, 0.4, 0.3];
  const i = cuts.findIndex((c) => score >= c);
  return GRADES[i < 0 ? GRADES.length - 1 : i];
}
const rank = (l) => GRADES.indexOf(l);
const capAt = (l, max) => (rank(l) < rank(max) ? max : l);

const VERDICT = [[/strong/i, 'A'], [/possible|partial|moderate/i, 'B−'], [/weak|poor|no fit|not a fit/i, 'D']];

// criteria: [{ criterion, must, status, evidence }] from the AI. Returns the icp_grade block of the brief,
// or null when there is nothing to judge (no ICP on file and no verdict).
export function computeIcpGrade(criteria = [], { verdict = '', why = '', icpOnFile = true } = {}) {
  const rows = (Array.isArray(criteria) ? criteria : [])
    .filter((c) => c && str(c.criterion))
    .slice(0, 10)
    .map((c) => ({ criterion: str(c.criterion), must: truthy(c.must), status: normStatus(c.status), evidence: str(c.evidence) }));

  if (!rows.length) {
    const v = VERDICT.find(([re]) => re.test(verdict));
    if (!v) return null;
    return { letter: v[1], basis: 'verdict', headline: `${str(verdict)} — graded from the overall verdict (no criterion-by-criterion check).`, detail: str(why), criteria: [] };
  }

  const n = { met: 0, partial: 0, missed: 0, unknown: 0 };
  for (const r of rows) n[r.status]++;
  const score = rows.reduce((s, r) => s + STATUS[r.status], 0) / rows.length;
  let letter = letterFor(score);
  const mustMissed = rows.filter((r) => r.must && r.status === 'missed');
  if (mustMissed.length >= 2) letter = 'D';
  else if (mustMissed.length === 1) letter = capAt(letter, 'C−');
  const provisional = n.unknown * 2 > rows.length;

  const fit = mustMissed.length ? 'Outside the ICP' : rank(letter) <= rank('A−') ? 'Strong ICP match' : rank(letter) <= rank('B−') ? 'Partial ICP match' : 'Weak ICP match';
  const counts = [`${n.met} of ${rows.length} criteria met`, n.partial && `${n.partial} partly`, n.missed && `${n.missed} missed`, n.unknown && `${n.unknown} not verified`].filter(Boolean).join(', ');
  return {
    letter,
    score: Math.round(score * 100),
    basis: 'criteria',
    provisional,
    headline: `${fit} — ${counts}.`,
    detail: [mustMissed.length ? `Must-have missed: **${mustMissed.map((r) => r.criterion).join(', ')}**.` : '', str(why)].filter(Boolean).join(' '),
    criteria: rows,
    ...(icpOnFile ? {} : { no_icp: true }),
  };
}

export const hasIcpGrade = (d) => !!(d && d.icp_grade && GRADES.map(normL).includes(normL(d.icp_grade.letter)));
function normL(l) { return String(l || '').replace(/\*$/, '').trim().toUpperCase().replace(/[−–—]/g, '-'); }
export const icpLetter = (d) => (hasIcpGrade(d) ? normL(d.icp_grade.letter) : null);

// Older talking points: grade from the ICP verdict they already carry (snapshot row or header chip).
export function icpGradeFromBrief(d = {}) {
  if (hasIcpGrade(d)) return d.icp_grade;
  const row = (d.snapshot || []).find((r) => /^icp/i.test(str(r?.label)));
  const chip = (d.header?.chips || []).find((c) => /^ICP/i.test(str(c?.label)));
  const text = str(row?.value) || str(chip?.label).replace(/^ICP:?\s*/i, '');
  const [verdict, ...rest] = text.split(/\s+[—–-]\s+/);
  return computeIcpGrade([], { verdict, why: rest.join(' — ') });
}

// Header chip for the grade ("ICP MATCH: B+").
export function icpChip(g) {
  if (!g) return { label: 'ICP MATCH: NOT GRADED', tone: 'warn' };
  return { label: `ICP MATCH: ${g.letter}${g.provisional ? '*' : ''}`, tone: rank(g.letter) <= rank('B−') ? 'brand' : 'warn' };
}

// The ICP block both engines ask the AI for (replaces the old {"verdict","why"}).
export const ICP_JSON = `"icp_fit":{"criteria":[{"criterion":"<one requirement taken from the ICP, e.g. Country / region, Company size, Revenue, Sector, Buyer role, US need>","must":<true if the ICP states it as a requirement or exclusion, else false>,"status":"met|partial|missed|unknown","evidence":"<the fact from the material that decides it, or 'not in the material'>"}],"verdict":"Strong fit|Possible fit|Weak fit","why":"<1-2 sentences against the ICP>"}`;
export const ICP_RULE = 'icp_fit.criteria: 4 to 8 criteria, each taken from the client\'s ICP text (geography, size, revenue, sector, buyer role, need…). "met" or "missed" only when the material shows it; otherwise "unknown" — never guess "met". Mark must=true for hard requirements and exclusions (e.g. an excluded country).';

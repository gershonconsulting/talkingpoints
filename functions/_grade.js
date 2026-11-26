// Social Network Effectiveness Grade on EVERY talking point (Olivier, 2026-11-26: "All talking have a
// matching grade"). The v1.16.0 engine computes the grade for new talking points (functions/_research.js
// computeGrade). A talking point saved without one (older AI talking points, a researched brief published
// without a grade) gets one here, on the same scale, from its own social table — never "not rated".

import { computeGrade, GRADES } from './_research.js';

// "12,345" | "1.2K" | "3M" | "—" -> number or null
export function parseAudience(text = '') {
  const m = String(text).match(/([\d][\d.,\s]*)\s*([KkMm])?\b/);
  if (!m) return null;
  let n = m[1].replace(/\s/g, '');
  const mult = m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1;
  if (mult > 1) n = n.replace(',', '.');
  else n = n.replace(/[.,](?=\d{3}\b)/g, '');
  const v = Math.round(parseFloat(n) * mult);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function gradeFromBrief(data = {}) {
  const rows = (data.social?.rows || []).filter((r) => r && r.channel).map((r) => ({ channel: r.channel, audience: parseAudience(r.audience) }));
  return { ...computeGrade(rows), backfilled: true };
}

// Letters compared without caring about "−" (engine) vs "-" (older briefs).
export const normLetter = (l) => String(l || '').trim().toUpperCase().replace(/[−–—]/g, '-');
export const LETTERS = GRADES.map(normLetter);
export const hasGrade = (data) => !!(data && data.grade && LETTERS.includes(normLetter(data.grade.letter)));

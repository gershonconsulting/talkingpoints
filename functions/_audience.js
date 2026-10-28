// Who a brief email is for, and what it may contain.
//
// Rule (2026-10-28, after the 10-26 Valos brief leaked the internal "Needs your attention" block):
// as soon as ONE recipient is outside Gershon (gershonconsulting.com / gershon.ai), the email is the
// CLIENT version: internal blocks are removed and it is sent as "Gershon Consulting".
// Only an all-Gershon recipient list gets the INTERNAL version (everything, sender "GC Talking Points":
// Gershon internal report senders start with "GC").

export const INTERNAL_DOMAINS = ['gershonconsulting.com', 'gershon.ai'];

// Number of this report in Gershon's report list; every subject starts with it.
export const REPORT_NUMBER = 21;

// Brief keys that are for Gershon only (see _render.js for the brief JSON).
// attention = "Needs your attention" (Streak / CRM data flags); the others are reserved for internal
// notes so the research step can add them without leaking.
export const INTERNAL_SECTIONS = ['attention', 'internal', 'internal_notes', 'crm_flags', 'streak_flags'];

const SENDER = 'talkingpoints@gershon.ai';
export const FROM_INTERNAL = `GC Talking Points <${SENDER}>`;
export const FROM_CLIENT = `Gershon Consulting <${SENDER}>`;

export function isInternalEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf('@') + 1);
  return e.includes('@') && INTERNAL_DOMAINS.includes(domain);
}

export const audienceOf = (to) => (to.length && to.every(isInternalEmail) ? 'internal' : 'client');

// Copy of the brief without internal blocks.
export function clientSafe(data = {}) {
  const out = { ...data };
  for (const k of INTERNAL_SECTIONS) delete out[k];
  return out;
}

export const briefSubject = (company, name, date) =>
  `[${REPORT_NUMBER}] Talking Points : ${company || ''} - ${name || 'New lead'} - ${date}`;

// Everything sendEmail needs except html/text rendering.
export function planBriefEmail(to, data) {
  const audience = audienceOf(to);
  return {
    audience,
    from: audience === 'internal' ? FROM_INTERNAL : FROM_CLIENT,
    data: audience === 'internal' ? data : clientSafe(data),
  };
}

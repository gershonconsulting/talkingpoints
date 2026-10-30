// Guards against look-alike company domains in recipient lists. "gershconsulting.com" (missing "on")
// is not ours, so a brief sent there would go to a stranger. Map: typo domain -> correct domain.
export const TYPO_DOMAINS = {
  'gershconsulting.com': 'gershonconsulting.com',
  'gershoncosulting.com': 'gershonconsulting.com',
  'gerschonconsulting.com': 'gershonconsulting.com',
  'gershonconsultng.com': 'gershonconsulting.com',
};

// Returns the suggested corrected address when `email` uses a known typo domain, else null.
export function suggestEmailFix(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return null;
  const fixed = TYPO_DOMAINS[e.slice(at + 1)];
  return fixed ? `${e.slice(0, at)}@${fixed}` : null;
}

// Splits a list into addresses that are fine and typo'd ones ({ email, suggestion }).
export function splitTypoEmails(list) {
  const ok = [], typos = [];
  for (const e of list) {
    const suggestion = suggestEmailFix(e);
    if (suggestion) typos.push({ email: e, suggestion }); else ok.push(e);
  }
  return { ok, typos };
}

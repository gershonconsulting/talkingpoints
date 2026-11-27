// Sender display name for Talking Points emails.
// v1.17.2 (nightly 2026-11-27) — GC sender safety net on INTERNAL mail only (same rule as socialtracking
// internalSender, PR socialtracking#8). Olivier: internal automated report emails show a display name
// starting with "GC". A Talking Points sender name is switched to "GC Talking Points" ONLY when every
// recipient is a Gershon address (gershonconsulting.com / gershon.ai / oattia@gmail.com). One outside
// recipient (a client) = the sender is returned exactly as given. The address is never touched, and the
// client brand "Gershon Consulting" is never renamed (planBriefEmail in _audience.js owns that choice).
export const GC_INTERNAL_DOMAINS = ['gershonconsulting.com', 'gershon.ai'];
export const GC_INTERNAL_ADDRESSES = ['oattia@gmail.com'];
const GC_SENDER_NAMES = { 'gershon talking points': 'GC Talking Points', 'talking points': 'GC Talking Points', 'talking points by gershon.ai': 'GC Talking Points' };
const bareAddr = (x) => { const s = String(x || '').trim(); const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).trim().toLowerCase(); };
const addrs = (v) => (!v ? [] : (Array.isArray(v) ? v : String(v).split(','))).map(bareAddr).filter(Boolean);
export function isGershonAddress(addr) {
  const a = bareAddr(addr);
  const at = a.lastIndexOf('@');
  return at > 0 && (GC_INTERNAL_DOMAINS.includes(a.slice(at + 1)) || GC_INTERNAL_ADDRESSES.includes(a));
}
export function isInternalOnly(to, cc, bcc) {
  const all = [...addrs(to), ...addrs(cc), ...addrs(bcc)];
  return all.length > 0 && all.every(isGershonAddress);
}
export function internalSender(from, to, cc, bcc) {
  if (typeof from !== 'string' || !isInternalOnly(to, cc, bcc)) return from;
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return from;
  const gc = GC_SENDER_NAMES[m[1].trim().toLowerCase()];
  return gc ? `${gc} <${m[2].trim()}>` : from;
}

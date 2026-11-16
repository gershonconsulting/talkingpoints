// Fills every [data-app-version] element from /version.txt (the single source),
// so the footer can never drift from the deployed version. The static text in
// the HTML is only the fallback if the fetch fails.
(function () {
  var els = document.querySelectorAll('[data-app-version]');
  if (!els.length) return;
  fetch('/version.txt', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : ''; })
    .then(function (t) {
      t = (t || '').trim();
      if (!/^\d+\.\d+\.\d+$/.test(t)) return;
      els.forEach(function (el) { el.textContent = (el.getAttribute('data-app-version-prefix') || 'v') + t; });
    })
    .catch(function () {});
})();

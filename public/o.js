/* The order tag's QR code opens /o/<order number> (o.html): open that order's
   page in the site, #/o/<NUMBER>. The same rule as src/lib/orderScan.ts
   orderScanHash (orderScan.spec.ts runs this file against it).

   A phone that opened the site before /o/ existed keeps the site's old offline
   copy, and that copy answers the scan itself with the site's old page. That
   page asks for its files under /o/assets/, and vercel.json sends those here.
   Then there is no "go" link (this is not o.html): wait for the site's new
   copy to take over (it does so at once), then open the order. Without this,
   the first scan on such a phone was a blank page (the live site, 2026-11-25). */
(function () {
  var m = /^\/o\/([A-Za-z0-9-]{1,40})\/?$/.exec(location.pathname);
  var to = m ? '/#/o/' + m[1].toUpperCase() : '/';
  var gone = false;
  function go() {
    if (gone) return;
    gone = true;
    location.replace(to);
  }

  var a = document.getElementById('go');
  if (a) {
    a.setAttribute('href', to);
    return go();
  }

  var sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
  if (!sw || !sw.controller) return go();
  if (document.body) document.body.textContent = 'Opening the order…';
  sw.addEventListener('controllerchange', go);
  // Never stuck here: if the new copy never takes over, go anyway.
  setTimeout(go, 20000);
  sw.getRegistration()
    .then(function (r) {
      if (!r) return go();
      return r.update().then(function () {
        // Nothing new coming: the new copy is already in charge.
        if (!r.installing && !r.waiting) go();
      });
    })
    .catch(go);
})();

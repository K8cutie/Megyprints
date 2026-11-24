/* The order tag's QR code opens /o/<order number> (o.html): open that order's
   page in the site, #/o/<NUMBER>. The same rule as src/lib/orderScan.ts
   orderScanHash (orderScan.spec.ts runs this file against it). */
(function () {
  var m = /^\/o\/([A-Za-z0-9-]{1,40})\/?$/.exec(location.pathname);
  var to = m ? '/#/o/' + m[1].toUpperCase() : '/';
  var a = document.getElementById('go');
  if (a) a.setAttribute('href', to);
  location.replace(to);
})();

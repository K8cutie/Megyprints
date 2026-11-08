/* Google sign-in return page for the Megy Prints apps (see src/lib/nativeAuth.ts).
   ANDROID: normally a verified App Link opens the app before this page even
   loads. If not, hand the tokens to the app via an intent:// link PINNED to
   our package, so no other app can receive them.
   IPHONE: megyprints://, caught by the Apple sign-in window the app opened.
   iOS schemes are not pinned to one app, so before the App Store release the
   iPhone app moves to a verified https return (Associated Domains, the
   owner's Apple team id): docs/mobile-port-plan.md "iPhone". */
(function () {
  var q = new URLSearchParams(location.search);
  var h = new URLSearchParams(location.hash.replace(/^#/, ''));
  var p = new URLSearchParams();
  ['access_token', 'refresh_token', 'expires_in', 'token_type', 'error', 'error_description'].forEach(function (k) {
    if (h.get(k)) p.set(k, h.get(k));
  });
  if (q.get('n')) p.set('n', q.get('n'));
  // Drop the tokens from this tab's address bar / history.
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  // Not signed in: cancelled, or refused (0054: that Gmail already has an
  // account). The app shows the reason in its sign-in box; say it here too.
  if (h.get('error')) {
    document.querySelector('h1').textContent = "You're not signed in";
    document.getElementById('msg').textContent = (h.get('error_description') || 'Sign-in was cancelled.') + ' Go back to the app.';
  }
  var intent = 'intent://auth?' + p.toString() + '#Intent;scheme=megyprints;package=com.megyprints.app;end';
  // iPhone (the Megy Prints iPhone app, mobile/src/lib/googleSignIn.ts): the
  // app opened Google in Apple's sign-in window (ASWebAuthenticationSession),
  // which catches this megyprints:// link itself and gives it only to the app
  // that opened it. Android keeps the pinned intent:// link above.
  var iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var link = iPhone ? 'megyprints://auth?' + p.toString() : intent;
  var back = document.getElementById('back');
  back.href = link;
  location.replace(link);
})();

/* Google sign-in return page for the Megy Prints ANDROID APP (see src/lib/nativeAuth.ts).
   Normally a verified App Link opens the app before this page even loads. If
   not, hand the tokens to the app via an intent:// link PINNED to our package,
   so no other app can receive them. */
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
  var back = document.getElementById('back');
  back.href = intent;
  location.replace(intent);
})();

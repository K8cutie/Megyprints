# Closed test checklist: Oct 30 to production

Your steps from now until Google Play lets Megy Prints into production. All
dates are 2026. Written Wed Oct 28.

Google refused production on Oct 26 (testers not engaged; feedback not acted on
through app updates). You can apply again on **Mon Nov 9** at the earliest. The
answers to paste are in [`play-production-application.md`](play-production-application.md).

## Rules for every app upload

- Upload to **Alpha** only. Never pause Alpha and never remove testers: a tester
  who leaves the test loses their 14 days.
- **Saving sends nothing.** A change reaches testers only after **Publishing
  overview > Send changes for review**.
- Paste the release notes from the matching file. Add nothing that isn't true.
- The files are in the main folder:
  `C:\megy-prints-flashdrive\V1\Megyprints-Clean\android-native\release\`

**How to upload a version** (used on Oct 30, Nov 2 and Nov 5):
1. Play Console > **Test and release > Testing > Closed testing > Alpha** >
   **Create new release**.
2. Under App bundles, tap **Upload** and pick the `.aab` file for that day.
3. Release name: leave what Play fills in (for example `4 (1.3.0)`).
4. Release notes: open the `release-notes-<version>.txt` file, copy all of it,
   and paste it into the box. If the box shows `<en-US>` and `</en-US>`, paste
   between those two lines.
5. Tap **Next**. If you see a red error, stop and send Claude a screenshot.
6. Tap **Save**.
7. Left menu > **Publishing overview** > **Send changes for review** > confirm.
8. Check Publishing overview until it says the changes are published.
9. On your phone: Play Store > Megy Prints > **Update**. Open the app and try
   the new thing.
10. Post in the tester group (groups.google.com/g/megyprints-testers > New
    conversation). If the computer asks for a CAPTCHA again, use your phone's
    browser.

---

## Fri Oct 30: upload 1.3.0 (code 4)

- [ ] First check 1.2.0: Alpha > Releases shows `3 (1.2.0)` as the live release.
      If it is still in review, wait until it is published, then upload 1.3.0.
- [ ] Upload `megyprints-1.3.0-code4.aab` with `release-notes-1.3.0.txt`
      (steps above).
- [ ] On your phone, after the update: start an album, go to the photo step
      and add photos. The picker should open in your Camera folder. Tap ⋮ >
      Select all.
- [ ] Post in the group, for example:

      Megy Prints 1.3.0 is out. Please update the app in Play Store.
      New: the photo picker opens in your Camera folder. Tap ⋮, then
      Select all, to add your whole camera roll.
      Today's test: tap "Make a sample album" on Step 1. Follow the steps
      on page 1 to the last page, and send me a screenshot of it.

## Mon Nov 2: merge 1.4.0, then upload 1.4.0 (code 5)

- [ ] GitHub: open the 1.4.0 pull request ("the app tells you when a new version
      is ready", branch `feat/android-1.4.0-update-prompt`; on Oct 28 it was
      not open yet, so ask Claude for the link). Checks green > **Merge**. Or
      tell Claude "merge 1.4.0".
      1.4.0 changes only the app, so there is no website deploy to wait for.
- [ ] Check `megyprints-1.4.0-code5.aab` is in the release folder. If it isn't,
      ask Claude to build 1.4.0.
- [ ] Upload `megyprints-1.4.0-code5.aab` with `release-notes-1.4.0.txt`.
- [ ] Post in the group: 1.4.0 is out; from now on the app tells you when a new
      version is ready. The box first shows when 1.5.0 comes out.

## About Thu Nov 5: merge 1.5.0, then upload 1.5.0 (code 6)

- [ ] GitHub: open the 1.5.0 pull request (planned: Share to Megy Prints; on
      Oct 28 it did not exist yet). Checks green > **Merge**. Or tell Claude
      "merge 1.5.0".
- [ ] If the 1.5.0 pull request changes the website too (it says so), wait for
      Vercel: vercel.com > the megyprints project > **Deployments**. The newest
      one at the top must say **Ready**. Then open https://megyprints.vercel.app
      once on your phone.
- [ ] Check `megyprints-1.5.0-code6.aab` is in the release folder (ask Claude
      if not).
- [ ] Upload `megyprints-1.5.0-code6.aab` with `release-notes-1.5.0.txt`.
- [ ] On a phone that has 1.4.0 from Play: open the app. A box should say a new
      version is ready > **Restart to update**. If it doesn't show, open the
      app again later. This is the first real test of the 1.4.0 box: if it
      never shows, tell Claude.
- [ ] Try 1.5.0's new thing the way its pull request says.
- [ ] Post in the group what's new and what to try.

## Every day (Oct 29 to Nov 9, and while Google reviews)

- [ ] Look at every place testers reach you:
  - Messenger (tester chats) and comments on your tester posts.
  - The tester group.
  - Play's private feedback: Play Console > **Monitor and improve > Ratings and
    reviews > Testing feedback**.
  - The feedback email on the Alpha **Testers** tab.
  - Admin > **Messages** (the Contact form) and Admin > **Errors**.
- [ ] Count the "You're done with today's test!" screenshots. The stamp shows
      the day and time the album was made, so check it is that day's album.
      Write down the date and the count; answer 2 of the application uses the
      total.
- [ ] Every real report (a problem, an idea, a question about how something
      works) goes in [`tester-feedback-log.md`](tester-feedback-log.md). Send it
      to Claude with the screenshot and say "add this to the tester log".
      Claude adds a row: the date, Source, their words, what we changed.
  - **Tester** = a real tester told you.
  - **Owner test** = you found it yourself.
  - **For testers** = something built for testers, not a reply to a report.
  - A screenshot with no comment shows a tester used the app. Count it; it is
    not a report.
- [ ] Fixes go live on the website first. The next app version's release notes
      list them.

## Sun Nov 8: check you can apply

- [ ] Play Console > **Dashboard**: the production access part shows a check
      mark for each part of Google's rule (at least 12 testers opted in, for at
      least 14 days in a row). **Apply for production** shows there once the
      test qualifies.
- [ ] Testers count: the number of testers opted in, from Play Console (the
      Dashboard's production access part, or the Alpha track under **Test and
      release > Testing > Closed testing**). Write it into answer 2.
- [ ] Phones: active devices, from Play Console's statistics page (type
      "Statistics" in the Play Console search box if you can't find it). Write
      it into answer 2.
- [ ] Test orders: Admin > **Orders**, count orders marked "Tester order ·
      MEGYTEST" since Oct 26, leaving out your own. Write it into answer 2.
- [ ] Reviewer login: **Monitor and improve > Policy and programs > App
      content > Sign in details** (the runbook calls it Policy > App content >
      App access).
      Sign in once in the app with the login written there. If it fails, fix
      it there now: a review that can't sign in can't reach checkout.
- [ ] Read the tester log. Add any report that is missing.
- [ ] Fill every `[FILL]` and `[OWNER]` in the application answers (or ask
      Claude to fill them from your numbers).

## Mon Nov 9: the testing-off switch, then apply

### A. The testing-off switch (your call when)

The switch is one line in `src/lib/testingPhase.ts`: `TESTING_PHASE = true`
becomes `false`. A pull request "turn off the testing features" will make that
change: [FILL: its link. On Oct 28 it was not open yet; ask Claude to open it
as a draft.] The comment in `testingPhase.ts` says "set TESTING_PHASE to false
before applying for production".

What it turns off (only the Android app ever showed these; the website never
did):
- "For Testing purposes" and the time on album pages.
- "Make a sample album" on Step 1.
- "Add N sample photos" on the photo step (to make up the 40).
- The sample album's welcome card on page 1 and its "You're done with today's
  test!" card on the last page.

What it does **not** turn off: the tester code MEGYTEST. That has its own
switch: Admin > **Pricing** > Tester code > **Off** > **Save tester code**.

The catch: it is a website change, so the moment it goes live every tester
loses the sample album and the stamp, on every app version. Google's review
usually takes seven days or less. During that time testers with fewer than 40
photos can't make an album, and new screenshots have no time on them. If Google
says no again, it can ask for more testing (last time: 14 more days from the
review date), and you would want the switch back on for that.

Pick one:
- **Option 1: off before you apply** (what the code comment says). Merge the pull
  request, wait for Vercel to say Ready, open the app and check the stamp and
  "Make a sample album" are gone, then apply.
- **Option 2: off when Google approves.** Keep testing as it is during the review.
  Merge the pull request the day Google says yes, before you make the
  production release (below).

Claude's view: option 2 keeps testers able to test during the review, and a test
stamp on a test track is normal. Either way the switch **must be off before
the production release goes to review**, or the reviewer and real customers
will see "For Testing purposes" and sample albums.

### B. Apply

- [ ] No `[FILL` or `[OWNER` left in the answers.
- [ ] Play Console > **Dashboard** > **Apply for production**.
- [ ] Paste each answer from `play-production-application.md` into the box with
      the same question. Pick the choices (how easy recruiting was, installs in
      the first year).
- [ ] Submit. Screenshot the "We have your application" screen.
- [ ] Keep the test running: don't pause Alpha, don't remove testers, keep
      doing the daily checks.
- [ ] If Google says no: send Claude the email. Last time the email said to
      test 14 more days from the review date.

## After Google approves

- [ ] If you picked option 2: merge "turn off the testing features", wait for Vercel
      to say Ready, open the app and check the stamp and "Make a sample album"
      are gone.
- [ ] Tester code: Admin > **Pricing** > Tester code > **Off** > **Save tester
      code**. The label must say "Off now". With it on, anyone who knows the
      code can place an order without paying.
- [ ] **Test and release > Production > Create new release** > **Add from
      library** > pick the newest version testers have (code 6 if 1.5.0 is
      out). The runbook calls this promoting the tested release.
- [ ] Release notes: what a new customer gets, in plain words. Nothing that
      isn't true.
- [ ] Countries / regions: start with **Philippines**.
- [ ] Rollout: if Play offers a staged rollout, start with a small percentage
      ([OWNER: the % to start with]). Raise it to 100% after a few days with no
      new problems: Production > Releases > **Manage rollout > Update rollout**.
      Google says "Staged rollouts can only be used for app updates, not when
      publishing an app for the first time"
      (https://support.google.com/googleplay/android-developer/answer/6346149).
      If the box isn't there, the release goes to everyone in the countries you
      picked, so keep it to the Philippines.
- [ ] Publishing overview > **Send changes for review**. The production release
      gets its own review.
- [ ] Data safety: no change, unless a version added a permission. Check: type
      **App bundle explorer** in the Play Console search box, find the newest
      version's permissions, and compare them with code 4. Up to 1.3.0 the app
      asks only for Internet; 1.4.0 adds Google Play's in-app update library.
      If a new permission shows up, ask Claude before you send anything.

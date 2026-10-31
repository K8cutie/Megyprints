# Apply for production: draft answers

For the second application to Google Play, on or after **Mon 2026-11-09**.
Google refused the first one on 2026-10-26 for two reasons: testers were not
engaged with the app, and feedback was not acted on "through updates to your
app". The answers below speak to both.

Google's rule for personal developer accounts made after November 13, 2023
(ours is one): a closed test with **at least 12 testers opted in continuously
for at least 14 days**. Review "usually takes seven days or less, but can
occasionally take longer". The form has three parts, the same as below.
Source: https://support.google.com/googleplay/android-developer/answer/14151465

**Before you paste:**
- Fill every `[FILL: …]` from Play Console or the admin pages, and every
  `[OWNER: …]` in your own words. Never send a box with a blank in it.
- Every sentence must be true on the day you send it. If something is not true
  yet (for example, 1.5.0 is not out), change it or take it out.
- Read [`tester-feedback-log.md`](tester-feedback-log.md) that morning. Add any
  new rows to answers 4 and 8.
- The questions below follow Google's help page. The form in Play Console has
  the exact words: answer what the form asks. If a box is too short, keep the
  first lines of each list.
- Day-by-day steps up to the application: [`play-closed-test-checklist.md`](play-closed-test-checklist.md).

---

## Part 1: About your closed test

### 1. How easy was it to recruit testers for your app?

The form gives a list of choices. Pick: `[OWNER: the choice that fits]`

If there is a box to explain:

> [OWNER: how you recruited testers]. Since October 26, anyone can join the
> test through our Google Group, megyprints-testers, and the test is open in
> all countries.

*Facts from:* your own changes in Play Console on 2026-10-26: Test and release >
Testing > Closed testing > Alpha > Testers tab (Google Group) and Countries /
regions (all countries). Check both are still set before you paste.

### 2. How engaged were your testers? Did they use all the features?

> On [FILL: the day you send this], [FILL: testers opted in that day, from
> Play Console] testers were opted in, and [FILL: active devices that day, from
> Play Console's statistics] phones had the app.
>
> After my first application, I made it easier for testers to try every part of
> the app:
> - "Make a sample album" on Step 1 makes a whole album from 40 sample photos,
>   with a different sample album each test day. Testers who don't have 40
>   photos on their phone can still make an album.
> - The last page of the sample album says "You're done with today's test!
>   Take a screenshot and send it as proof." In the test app, album pages show
>   "For Testing purposes" and the date and time the album was made, so each
>   screenshot shows the tester made an album that day.
> - The code MEGYTEST lets a tester go through the whole checkout without
>   paying. Nothing is printed or sent.
>
> Testers sent [FILL: number of "You're done" screenshots, Oct 28 – Nov 8]
> screenshots of the last page, and placed [FILL: test orders, admin Orders
> page, marked "Tester order · MEGYTEST"] test orders with MEGYTEST.
>
> Did they use all the features? [OWNER: yes / most of them / not all. Name
> the ones testers used: making an album, changing pages, preview, test
> checkout. Name any they did not use.]

*Facts from:* the testing aids live on 2026-10-28 (#206, #207; the words are in
`src/lib/samplePhotos.ts` and `src/lib/testingPhase.ts`) and MEGYTEST (#197,
live 2026-10-26); rows "For testers" in the tester log (the #206 and #207 rows
come with the 1.4.0 pull request). Numbers from Play Console, your own count of
screenshots, and the admin Orders page.

### 3. Did testers use the app the way real customers will? What was different?

> [OWNER: Yes / Mostly / No]. Testers go through the same steps a customer
> does: name the album, pick a size, add photos, pick a cover, make the album,
> change pages, and go to checkout. Two things are different on purpose:
> - Testers can make a whole album in one tap from our sample photos ("Make a
>   sample album"). Customers use their own photos.
> - Testers use the code MEGYTEST, so they don't pay and nothing is printed or
>   sent. A customer pays by bank transfer: they scan our InstaPay QR code with
>   their bank or e-wallet app. We check the payment, then print the album and
>   ship it.
>
> [OWNER: anything else you saw testers do differently from a customer]

*Facts from:* the album steps (Name, Size, Photos, Cover, Make my album, edit,
order), the sample album (#207), MEGYTEST (#197, #198), and the Pay screen in
`src/pages/Order.tsx` (GoTyme Bank account, InstaPay QR scanned from any bank or
e-wallet app; the receipt is optional).

### 4. Summarize the feedback from testers, and how you collected it.

> How I collected it: [OWNER: say where testers reached you: Messenger, the
> tester group, Play's private feedback, the feedback email on the test page].
> I write every report in a log: the date, what the tester said, what we
> changed, and the app version that has it.
>
> What testers told us, and what we changed:
> - Oct 24: a tester made a second account by typing her email wrong. Now
>   sign-in says to check the email for a typo, and signing up with an email
>   that already has an account takes you to Sign in. Live Oct 26.
>   [OWNER: add "The same Gmail can't make a second account" only if the Gmail
>   hook is switched on: Supabase dashboard > Authentication > Hooks > Before
>   User Created. On Oct 26 it was not on yet.]
> - Oct 27: "Login using Gmail is not working, and forget password is entering
>   direct in your app". Now closing "Make a new password" signs you out, and
>   Google sign-in inside Messenger tells you to open Chrome. Live Oct 27.
> - Oct 27: "I can't send more than 1 photo". We changed three things: photos
>   now come before the cover, so the first picker takes all your photos; the
>   photo step shows how to pick many photos at once; and in app 1.3.0 the
>   picker opens in the Camera folder, so Select all takes the whole camera
>   roll. The first two went live Oct 27.
> - [FILL: each tester report after Oct 28 from tester-feedback-log.md, one
>   line: date, what they said, what we changed]
>
> From my own test order: the tester code box was hard to see, a test order
> said "Payment confirmed", and "Making your print file…" sat for minutes with
> nothing moving. Now the box is easy to see, a test order says nothing is
> charged or printed, and a progress bar follows the real work, page by page.

*Facts from:* [`tester-feedback-log.md`](tester-feedback-log.md): rows with
Source "Tester" (the three reports) and "Owner test" (the last paragraph). The
Oct 24 wording is from #187 (`src/lib/accountErrors.ts`). Never write "tester"
for an Owner test or For testers row.

---

## Part 2: About your app

### 5. Who is your app for?

> Adults in the Philippines who have photos on their phone and want them as a
> real printed photo album. [OWNER: who orders from you most, only if true].
> Prices are in pesos, and we ship in the Philippines.

*Facts from:* runbook Step 4 (target audience 18+); checkout takes Philippine
addresses (province, city, barangay) and prices in pesos.

### 6. How does your app give value to users?

> You make a printed photo album from your phone, without a computer. Add at
> least 40 photos, pick a size and a cover, and the app lays out the pages for
> you. Change any page you want and see the whole album before you order. Pay by
> bank transfer: scan our InstaPay QR code with your bank or e-wallet app. We
> check the payment, then print the album and ship it to you. The pages are made
> on your phone, and your photos stay there unless you ask Megy to write a line
> for a photo. When you order, the finished print file is sent to us for
> printing.

*Facts from:* the album steps and 40-photo minimum (albumMinimum), the Pay
screen in `src/pages/Order.tsx` (InstaPay QR, receipt optional), print files
made on the phone at checkout, and "Write a line for this photo", which sends
small copies of that page's photos through our server (runbook Step 4, Data
safety).

### 7. How many installs do you expect in the first year?

> [OWNER: pick the range on the form.]

*Facts from:* your own plan. No number is written here on purpose.

---

## Part 3: About your production readiness

### 8. What did you change in the app because of the closed test?

> After Google's answer on October 26, I put out a new app version on the test
> track every few days, with release notes that say what changed. From 1.3.0
> on, each version also has a change inside the app:
> - 1.2.0 (sent Oct 27): no change inside the app. Its release notes list
>   fixes we made on the website since 1.1.0.
> - 1.3.0 ([FILL: date published on Alpha]): the photo picker opens in the
>   Camera folder, so Select all takes the whole camera roll. This came from the
>   tester who could not add more than one photo.
> - 1.4.0 ([FILL: date published on Alpha]): the app tells you when a new
>   version is ready. Tap "Restart to update".
> - 1.5.0 ([FILL: date published on Alpha]): [FILL: the change inside the app,
>   in one line from release-notes-1.5.0.txt. The plan on Oct 28 was "Share to
>   Megy Prints"; there was no 1.5.0 yet.]
>
> Fixes on our website reach every app version as soon as they go live. The
> fixes from testers are in answer 4. For testers I also added the sample
> album, the "For Testing purposes" stamp, the "You're done" page and the test
> code MEGYTEST.

*Facts from:* the "App versions on the Alpha track" table in the tester log and
the release dates in Play Console > Alpha > Releases (1.2.0 went to review on
Oct 27); the runbook's version table (1.2.0 = no change inside the app); release
notes in `android-native/release/release-notes-<version>.txt`. The 1.2.0 notes
were changed while uploading, so the file is not what testers saw; Play shows
the notes that were sent.

### 9. How did you decide the app is ready for production?

> - Testers can now make an album from start to finish:
>   [FILL: number] testers sent the "You're done" screenshot.
> - I placed a test order myself, from photos to print file, and fixed what I
>   found (answer 4).
> - Every tester report in my log has a fix that is live. [OWNER: or say what
>   is still open and when you will fix it]
> - [FILL: problems on the admin Errors page in the last 7 days, checkout first.
>   Write "none" only if it shows none.]
> - The test has run since [FILL: the day Alpha first went live, Alpha >
>   Releases], with [FILL: number] app updates since October 26.

*Facts from:* your screenshot count; "Owner test" rows in the tester log; the
tester log's open items; admin > Errors; Play Console > Alpha > Releases.

---

## Before you press Submit

- [ ] No `[FILL` or `[OWNER` left in what you pasted.
- [ ] The tester count matches Play Console on the day you send it.
- [ ] Every report in answer 4 is a row in the tester log, with the right Source.
- [ ] You decided about the testing-off switch (checklist, Mon Nov 9).
- [ ] Screenshot the "We have your application" screen after you submit.

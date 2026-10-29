# Tester feedback log (closed test, Alpha track)

Google turned down production access on 2026-10-26: testers were not engaged
enough, and feedback was not acted on "through updates to your app". The next
application (2026-11-09 at the earliest) asks us to sum up what testers told us
and what we changed. This log is that record. Every line must be true.

**Source** says where a report came from:
- **Tester**: a person in the closed test (Messenger, the tester group, Play feedback).
- **Owner test**: the owner's own test order or walk.
- **For testers**: built so testers can use the app, not a reply to a report.

**Live** is the day the fix reached everyone. Website fixes go live through
Vercel at once, inside every app version. **App version** is the Play release
whose notes list it.

| Reported | Source | What they told us | What we changed | Live | App version |
|---|---|---|---|---|---|
| 2026-10-24 | Tester | Made a second account by mistyping her email | "Already has an account" sends you to Sign in; the same Gmail can't make a second account (#187) | 2026-10-26 | 1.2.0 |
| 2026-10-26 | For testers | — | Tester code MEGYTEST: walk the whole checkout without paying; nothing is printed or sent (#197) | 2026-10-26 | 1.2.0 |
| 2026-10-26 | Owner test | The tester code box was hard to see; a test order said "Payment confirmed" | The box can be seen; a test order says nothing is charged or printed (#198) | 2026-10-26 | 1.2.0 |
| 2026-10-26 | Owner test | "Making your print file…" sat for minutes with nothing moving | A progress bar that follows the real work, page by page, and the screen stays on (#199) | 2026-10-26 | 1.2.0 |
| 2026-10-27 | Tester | "Login using Gmail is not working, and forget password is entering direct in your app" | Closing "Make a new password" signs you out; Google sign-in inside Messenger says to open Chrome (#200) | 2026-10-27 | 1.2.0 |
| 2026-10-27 | Tester | "I can't send more than 1 photo" | Photos come before the cover, so the first picker takes all your photos (#201) | 2026-10-27 | 1.2.0 |
| 2026-10-27 | Tester | (same report) | A box on the photo step: press and hold, or ⋮ → Select all (#202) | 2026-10-27 | 1.2.0 |
| 2026-10-27 | Tester | (same report) | The photo picker opens in the Camera folder, so ⋮ → Select all takes the whole roll. Before, it opened on Recent, where Select all took only the newest 64 pictures, screenshots too | with 1.3.0 | 1.3.0 |
| 2026-10-28 | For testers | — | Album pages in the app show "For Testing purposes" and when the album was made (#206) | 2026-10-28 | 1.4.0 |
| 2026-10-28 | For testers | — | "Make a sample album" on Step 1, and sample photos to make up the 40-photo minimum, a different sample album each test day (#207) | 2026-10-28 | 1.4.0 |
| 2026-10-28 | For testers | — | The app asks to download each new version, then says when it is ready: "Restart to update" | with 1.4.0 (first shows when 1.4.1 is out) | 1.4.0 |
| 2026-10-29 | Tester | "The sample photos are helpful to test. I like the concept. maybe a little less text in the steps [too many things to read hah]" (owner: he meant a faster way to the sample album) | "Make today's sample album" on the app's home screen, one tap (#227). The next day, "Welcome back" makes today's sample album (#208) | on merge | 1.4.1 |
| 2026-10-29 | Owner test | testers screenshot the home page or just flip pages; the daily test should prove real use | Today's test before the sample album is made: type today's date as the name, then choose the cover or tap today's colour (alternating daily; the colour changes each day and only that colour counts); then Make my album opens on "You're done" (#228) | on merge | 1.4.1 |
| 2026-10-29 | Owner test | "for now please disable resume from where you left off or open existing album feature on the onset" | In the app while testing, no "Welcome back" or "You have an album in progress" at the start: Start Creating and Make today's sample album start a new album. Signed in, the old album stays in your account; signed out with your own album on the phone, it asks first (#228) | on merge | 1.4.1 |

## App versions on the Alpha track

| Version | Code | Built | What's in it |
|---|---|---|---|
| 1.1.0 | 2 | 2026-10-01 | Native shell: no 100-photo limit, Google sign-in in a Chrome tab |
| 1.2.0 | 3 | 2026-10-27 | Version only; notes list the website fixes above (#204) |
| 1.3.0 | 4 | 2026-10-27 | Photo picker opens in the Camera folder |
| 1.4.0 | 5 | 2026-10-28 | The app tells you when a new version is ready |

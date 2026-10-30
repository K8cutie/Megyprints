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
| 2026-10-29 | Tester | "The sample photos are helpful to test. I like the concept. maybe a little less text in the steps [too many things to read hah]" (owner: he meant a faster way to the sample album) | "Make today's sample album" on the app's home screen, one tap (#227). The next day, "Welcome back" makes today's sample album (#208) | 2026-10-29 | 1.4.1 |
| 2026-10-29 | Owner test | testers screenshot the home page or just flip pages; the daily test should prove real use | Today's test before the sample album is made: type today's date as the name, then choose the cover or tap today's colour (alternating daily; the colour changes each day and only that colour counts); then Make my album opens on "You're done" (#228) | 2026-10-29 | 1.4.1 |
| 2026-10-29 | Owner test | "for now please disable resume from where you left off or open existing album feature on the onset" | In the app while testing, no "Welcome back" or "You have an album in progress" at the start: Start Creating and Make today's sample album start a new album. Signed in, the old album stays in your account; signed out with your own album on the phone, it asks first (#228) | 2026-10-29 | 1.4.1 |
| 2026-10-29 | Owner test | the daily test proves only one task, and the done page doesn't show it; Step 1 still skipped the test; "Do 10 test pool that shows different feature", "Also let them spend a minute on the app", and testers should always get the newest app | Each day: today's date, one task from a pool of 10 on Today's test (cover photo, background colour, occasion, album size, or the cover title's font, colour, side, style, size or shadow) and one from a pool of 5 in the album (new layout, words in a box, a photo filter, swap a photo, open book). "You're done" comes only after both and a minute in the app, and names both tasks. Step 1's sample album goes through the test too. Coming back to the app on Home loads the newest version (#229) | 2026-10-29 | 1.4.1 |
| 2026-10-29 | Owner test | the daily test should read like a tutorial | The daily test reads as a daily lesson: Try it cards, a coach mark in the album, lessons and features tried so far (#230) | 2026-10-30 | 1.4.2 |
| 2026-10-29 | Owner test | "Can we call it User tutorial instead of sample album" | Testers see "User tutorial" where it said "sample album": "Start the User tutorial" on Home and Step 1, and the lesson screen is "User tutorial", "Today's lesson" (#230) | 2026-10-30 | 1.4.2 |
| 2026-10-30 | Tester | "Hi this overlay is not closing even tho clicking on close cross make it blank but not completely closes and i can't drag it up to close it even" | On a phone, Megy's panel closes: the ✕ closes the whole panel (before, it hid only the card and left the panel open and blank), dragging its handle up or down closes it, and Back closes it first. It no longer stays open into Preview, so it never covers "You finished today's lesson!" (#231) | 2026-10-30 | 1.4.2 |
| 2026-10-30 | Owner test | Megy's old steps 5–7 repeat on-screen buttons and caused a tester bug; the chat box takes space on phones | The guide ends at Make my album (4 steps); on phones the chat is behind an Ask Megy link (#232) | 2026-10-30 | 1.4.2 |
| 2026-10-31 | Tester | "Even though minors may be able to navigate the application, I recommend that you restrict it to adults only. Additionally, ensure your terms of service state that all users declare themselves to be of legal age." | A Terms of Service page: you must be 18 or older to make an account or order, what we won't print, how ordering works. Linked beside Privacy Policy in the menu and footer, and one line under Create Account and Place order: "By … you agree to our Terms of Service and confirm you're 18 or older." The privacy policy says 18 too (was 13) | on merge | 1.4.3 |

## App versions on the Alpha track

| Version | Code | Built | What's in it |
|---|---|---|---|
| 1.1.0 | 2 | 2026-10-01 | Native shell: no 100-photo limit, Google sign-in in a Chrome tab |
| 1.2.0 | 3 | 2026-10-27 | Version only; notes list the website fixes above (#204) |
| 1.3.0 | 4 | 2026-10-27 | Photo picker opens in the Camera folder |
| 1.4.0 | 5 | 2026-10-28 | The app tells you when a new version is ready |

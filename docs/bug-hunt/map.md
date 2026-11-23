# Bug hunt map: Megy Prints 2.0 app (draft, 2026-11-23)

**Status: DRAFT by Overseer (me).** Mother audits this map for completeness before any testing starts (2026-11-24). A square missing from here is a finding against the map, not a pass.

How to read it:
- Every **square** is one thing to test. It is done only with **proof Mother re-ran herself**: the steps, plus a screenshot, log or database row. "Looks fine" is not proof.
- Status is one of: `not tested` · `passed (proof)` · `failed (proof)` · `unverified` (the check couldn't run; fail-closed, so it is not passed).
- **Where:**
  - `emu` = emulator with the local test database
  - `S25` = the owner's phone (things the emulator can't do: HDR video, camera files, real notifications)
  - `DB` = read-only database check
  - `code` = reading code
- **Every square is also run backward:** press Back, leave the app, and kill the app at that step, then come back. Nothing may be lost, doubled, or charged twice.
- **Situations** (section S) are crossed with every lane's squares by pairwise cases, not one by one.

Lane order, by money lost if it breaks:
1. Place order and print files
2. What prints: editor
3. Videos and QR memories
4. Account, sync, Order again
5. Shop admin
6. Website

Lane 1 is detailed. Lanes 2–6 are outlines, and each is filled in (and audited by Mother) the day it starts. That is said here so it doesn't read as covered.

---

## Money fault trees (backward: from what costs money, to every input that feeds it)

Each output below must be traced back to every input. Each input is a square in a lane.

| Output (costs money if wrong) | Inputs that feed it | Lane |
|---|---|---|
| **Interior print file** (pages PDF) | every page's layout, photos (JPEG/HEIC/PNG, huge, tiny, rotated, missing), framing/pan/zoom, masks (deckle, torn…), words (74 fonts × bold/italic, sizes, colours, WordArt effects, words on photos), page colours and gradients, textures, stickers/graphics, QR codes, album size, page count, blank pages | 1, 2 |
| **Cover file** | cover photo, cover title (font, bold/italic, colour, effects, shape), cover colour, background image, spine (hardcover), back cover Megy mark, cover type, album size | 1, 2 |
| **Order row** (price, what's included) | size, cover type, material, page count, video memories (count, packs, longer videos ₱199/₱399, years 5/10/15/20), tester code (admin only), affiliate code / ?ref link, event booking (switched off), shipping, address | 1 |
| **Payment record** | "I've sent the payment", receipt picture, reference, unpaid cap (3), order expiry | 1 |
| **QR video page** | video upload (size ≤ 50 MB Free plan, HDR, HEVC, long, many), memory rows, hosting years, renew, replace (off) | 3 |
| **Delivered album matches the preview** | everything above + the print console's sheets (Mini imposition, staples) | 1, 2, 5 |

---

## Lane 1: Place order and print files (detailed)

### 1A. Getting to checkout
| # | Square | How | Proof | Where |
|---|---|---|---|---|
| L1-01 | Preview → "Order this album" on the last page | forward, Back from checkout returns to the same page | screenshots | emu |
| L1-02 | Order from Your orders → "Order this album again" | for a delivered, a cancelled and an unpaid order | screenshot + new order row | emu, DB |
| L1-03 | Order when the album has an unpaid order already ("Place a second order?") | Open existing / Yes second order / Back | screens + rows (no extra row on Back) | emu, DB |
| L1-04 | Order an album made on the website (never opened in the app editor) | its fonts are fetched before the print file (#319) | order row + files | emu, DB |
| L1-05 | Order when signed out / session expired | sign-in prompt, then back to checkout with nothing lost | screens | emu |
| L1-06 | "Too few photos" (under the 40-photo gate) | the order button is blocked with the reason | screenshot | emu |
| L1-07 | Album not saved yet / album load fails / offline on load | the right words show (ALBUM_NOT_SAVED, ALBUM_LOAD_OFFLINE) | screenshots | emu |

### 1B. The checkout form
| # | Square | How | Proof | Where |
|---|---|---|---|---|
| L1-10 | Name: empty, 1 word, very long, emoji, ñ/accents | error words, nothing sent | screenshots | emu |
| L1-11 | Phone: 09…, +63…, spaces, too short, landline | accepted/refused as the website does | screenshots | emu |
| L1-12 | Address: province → city → barangay; change province after picking city | city/barangay reset; offline address lists (PSGC) | screenshots | emu |
| L1-13 | Street, ZIP: empty, long, letters in ZIP | error words | screenshots | emu |
| L1-14 | Prefilled details from the last order | correct, editable | screenshot | emu |
| L1-15 | Price lines for each size × cover × material × video packs × years | total = price list; compare with the website's price for the same album | screenshot + order row quote | emu, DB |
| L1-16 | Mini: ₱350 + ₱120 shipping, 2 videos included, extra packs of 3 for ₱100 | totals match the price list | screenshot + row | emu, DB |
| L1-17 | Longer videos (₱199 up to 3 min / ₱399 up to 5 min, once per album) | price line appears only when a video is long | screenshot + row | emu, DB |
| L1-18 | Code box: affiliate code (good, wrong, own code, paused program), ?ref link kept, remove | discount line and commission row correct | screenshots + rows | emu, DB |
| L1-19 | Code box: MEGYTEST from a customer account | answers "wrong", order refused if forced (0069) | screenshot + DB | emu, DB |
| L1-20 | Code box: MEGYTEST from an admin account | free, tagged tester order, real price kept | row | emu, DB |
| L1-21 | Event deal lines (events switched off 2026-11-16) | confirm unreachable for customers | code + screens | code, emu |
| L1-22 | Terms / 18+ line and links | open and return | screenshots | emu |

### 1C. Place order (the send)
| # | Square | How | Proof | Where |
|---|---|---|---|---|
| L1-30 | Happy path for each size (6 album sizes + Mini) and each cover type | order row + cover.pdf + pages PDF + memory rows; files_missing empty | DB + files opened | emu, DB |
| L1-31 | Print file matches the Preview, page by page | render the PDFs; compare with Preview screenshots | images side by side | emu |
| L1-32 | Kill the app during each step: making files, cover upload, pages upload, video upload, memory rows, payment | the order shows "Finish sending"; nothing doubled; Finish completes it | rows before/after | emu, DB |
| L1-33 | Go offline during each step (airplane mode) | words say no internet; nothing doubled; retry works | screenshots + rows | emu, DB |
| L1-34 | Leave the app (Home) during send | keeper notification shows progress; send finishes in background | notification + rows | emu, S25 |
| L1-35 | Notifications permission denied | send still finishes; no crash | rows | emu |
| L1-36 | Unpaid cap: a 4th unpaid order | UnpaidLimitError words | screenshot | emu |
| L1-37 | A video over 50 MB / an HDR video / a missing video file | ClipTooBig / shrink / MissingClip words before any order row | screenshots + no row | emu, S25 |
| L1-38 | Page or cover the app can't draw (font not on phone + offline; old theme picture; blob address) | plain words, no order row | screenshot + no row | emu |
| L1-39 | Photo file deleted from the phone after picking | PhotoNotOpened words, which photo, which page | screenshot | emu |
| L1-40 | Very large album (max pages, 200+ photos) | finishes; memory stays sane; time recorded | rows + timing | emu, S25 |
| L1-41 | Low storage on the phone | words, no half order | screenshot + rows | emu |
| L1-42 | Two taps on Place order quickly | one order only | rows | emu, DB |

### 1D. After the order: payment, Your orders, Finish sending
| # | Square | How | Proof | Where |
|---|---|---|---|---|
| L1-50 | Payment step: QR, account, copy order number, "I've sent the payment" with and without receipt | payment row; receipt stored | rows + storage | emu, DB |
| L1-51 | Receipt picture unreadable / huge / HEIC | receiptError words; payment still recorded | screenshot + row | emu |
| L1-52 | Back from payment, come back later from Your orders → Pay | same order, same amount | screenshots | emu |
| L1-53 | Your orders: every status (unpaid, paid, printing, shipped, delivered, cancelled, expired, unsent, tester) shows the right words | seed each status in local DB | screenshots | emu, DB |
| L1-54 | Cancel an unpaid order (Yes / Keep) | status cancelled; can't pay it after | rows | emu, DB |
| L1-55 | Finish sending: from Your orders and from the order page; with photos gone / album changed since | completes or plain words (FINISH_PHOTOS_MISSING) | rows | emu, DB |
| L1-56 | Unpaid order expiry | expires on time; words | DB | DB |
| L1-57 | "Message us" links | open the right channel | screenshot | emu |

### 1E. Real-album replay (DB, read-only; first run 2026-11-23)
`mobile/test/realAlbums.check.ts` runs every live album through Place order's own check. **First run: 49 of 311 albums blocked. These are candidates, not confirmed. Mother confirms.**

| # | Candidate | Albums | With orders | Note |
|---|---|---|---|---|
| L1-60 | Cover or page background `/themes/bg/travel.svg`, an old theme picture the app doesn't have | 26 | 0 | from the old themes (pages[].background.image, cover_front.background.image) |
| L1-61 | Cover background saved as a `blob:` address (a browser-only, temporary address) | 20 | 3 | newest saved 2026-11-06; is it still happening on the website? Did the 3 orders print right? |
| L1-62 | `/themes/bg/kids.svg` | 3 | 0 | same as L1-60 |
| L1-63 | Fonts | 0 | 0 | 0 after #319 (was 17 font + style pairs) |

---

## Lane 2: What prints: editor (outline, filled in on its day)
- **Pages:** every layout per size (incl. Mini's 12), Change layout sheet, add/remove/reorder pages, blank pages reminder, page 1 right, opening full pages.
- **Photos:** pick (day select, select all), HEIC, huge/tiny/panorama/rotated (EXIF), duplicates, swap, pan/zoom framing, empty slot tap, photo check (blur), face finder, scenes grouping, time order.
- **Words:** captions, free text, quotes (quote bank, photo quotes), 74 fonts × bold/italic (incl. one-weight fonts), sizes, colours (any colour), WordArt (outline, two colours, glow, shape), words on photos, "Too long for this box", drag.
- **Colours:** 28 page colours + 12 gradients, textures.
- **Cover:** cover photo pick, title (font/effects/colour), cover colour, back cover mark, spine.
- **Undo, Back/kill mid-edit, two phones editing the same album, website edits arriving.**

## Lane 3: Videos and QR memories (outline)
- Add a video to a page: short, long (3/5 min), HDR, HEVC, portrait/landscape, 4K, slow-motion, no sound. Size over 50 MB.
- Shrink step; upload; QR printed on the page; the QR page plays on iPhone Safari, Android Chrome, FB in-app browser.
- My memories: list, years left, renew; Replace video (switched off: confirm unreachable); delete and re-make (no old video comes back, #275).

## Lane 4: Account, sync, Order again (outline)
- **Sign-in:** Google, email/password, forgot password, password eye, wrong password, duplicate email.
- Change password, delete account (clips, orders kept as required), sign out mid-flow.
- **Two-device sync:** album edited on phone + website; conflict; offline edits.
- Profile, affiliate page (apply, code, link, commissions), legal screens, the app update box.

## Lane 5: Shop admin (outline)
- **Orders console:** unsent flags (0068), print files open, Mini print console/imposition, mark paid/shipped, tester orders tagged, Overview totals (tester orders counted? known).
- **Pricing tab:** MEGYTEST on/off, prices → app and website both follow.

## Lane 6: Website (outline; mobile first, so last)
- Same journeys as lanes 1–4 in a phone browser and desktop. **Parity:** the same album prints the same from app and website.
- L1-61's `blob:` covers: find where the website saves them.

---

## S. Situations (crossed with every lane by pairwise cases)
- **Internet:** none, slow (3G-like), drops mid-step, Wi-Fi sign-in page.
- **App:** killed, backgrounded, phone restarted, app updated mid-flow (old draft, new version).
- **Phone:** low storage, low memory, Android 7 (API 24, the lowest) to 16, small screen, big system font, dark mode, landscape.
- **Permissions:** photos (all / selected only / denied), notifications denied.
- **Account:** new phone or reinstall (no saved fonts or photos), signed out, two phones at once.
- **Data:** album made on the website; album from an old version (themes); 40, 100, 200+ photos.

## S25 checklist (owner's phone: the emulator can't do these)
1. Order a Mini with a video shot on the S25 (HDR): it shrinks, sends, and plays from the QR.
2. Finish sending MP-2026-W284PW8 (the stuck HDR order) on 2.1.6.
3. Pick 40+ camera photos incl. a few HEIC/motion photos; order.
4. Leave the app during Place order; the notification shows progress; the order completes.
5. A cover title in Shrikhand bold: Preview has no "look simpler" line; Place order works (#319).

# port-renderer-everything: evidence

Branch `feat/port-renderer-everything`, PR into `native-2.0` (the 2.0 branch; main is not touched).

## On the phone (emulator, 2026-10-29)

`phone-*.png`: the golden page or cover drawn by **the phone's own Skia** (react-native-skia 2.14 native, Hermes, release build with the golden pages, `pwa_test` emulator, Android 14, x86_64), at print size, next to the website's print file. Each picture is **website | phone | difference** (pixelmatch), then the same three at full size where they differ most. Made by `npm run golden:phone` (mobile/test/goldenPhone.check.ts), the same bars as the Node check.

| File | What it shows |
|---|---|
| phone-texture-linen-sage, phone-texture-marble-faded | page textures, tinted, faded |
| phone-gradient-64-radial-3 | a three-colour radial wash |
| phone-qr-chip-64, phone-qr-in-caption-box, phone-qr-moved-turned-64 | memory QR codes |
| phone-graphic-in-frame, phone-graphic-moved-turned | graphics |
| phone-stickers-88, phone-sticker-stretched | stickers |
| phone-corners-64 | corner art |
| phone-looks-four | colour looks |
| phone-soft-edges, phone-textured-edges | soft and textured edges |
| phone-big-photo-small-frames | a 3200 px photo drawn small (Skia's halving) |
| phone-photo-background-faded-64 | a faded photo background |
| phone-cover-88-hard-edge-words, phone-cover-64-soft-plain | cover files (pass) |
| phone-cover-86-old-form | the one cover that fails on the phone (back blurb's light outline, 17.8% ink) |
| emulator-golden-screen-drawing, emulator-golden-screen-done | the app's Golden pages screen during and after the run |
| qr-decoded-from-phone-pngs.json | OpenCV's QR reader on the phone's QR pages: all 4 decode to their megyprints.app/m/ links |
| light-weight-trials.txt | each light text's ink against the website's at 0, 0.15, 0.2, 0.25 px of weight |
| phone-memory.json | the app's memory (total PSS) through the run |

The 15 pictures below (no `phone-` prefix) are the earlier **Node (CanvasKit)** check: website | app | diff.

### The Node (CanvasKit) pictures (from 58f9ea3)

Each picture: the website's print picture (headless Chromium, printPipeline), the 2.0 app's picture (mobile/src/render, CanvasKit in Node), and the pixelmatch diff (red: pixels that differ; inside the words' ink they are letter edges, DirectWrite vs FreeType, held to the ink bars instead). Pages side by side; covers top to bottom (website, app, diff). All 75 golden pages, 6 covers (cover-64-soft-plain's title 0.52 px off, the known Windows-Chromium difference) and 32 texture tiles pass; 40 mistake tests fail as they must. Website print files byte-identical: 156 of 156 (tools/golden/websiteSame.mjs), again after merging native-2.0, against main as the branch left it and against native-2.0.

(This folder earlier also held 22 pictures from other jobs by mistake; they were removed. They are in their own folders.)

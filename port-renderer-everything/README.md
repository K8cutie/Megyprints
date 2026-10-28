# 2.0 app renderer: everything print draws (feat/port-renderer-everything 58f9ea3)

Each picture: the website's print picture (headless Chromium, printPipeline),
the 2.0 app's picture (mobile/src/render, CanvasKit in Node), and the
pixelmatch diff (red: pixels that differ; inside the words' ink they are
letter edges, DirectWrite vs FreeType, held to the ink bars instead).
Pages side by side; covers top to bottom (website, app, diff).

All 75 golden pages, 6 covers and 32 texture tiles pass; 40 mistake tests
fail as they must. Website print files byte-identical before and after the
shared-file split: 156 of 156 (tools/golden/websiteSame.mjs).

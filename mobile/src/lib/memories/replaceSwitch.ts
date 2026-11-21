/* Replace video on or off. Owner, 2026-11-21: "add that feature in .5 but
   disable it for now". It is a fix for a complaint ("my video is blurry",
   "it's the wrong video"), not something to show off, so 2.1.5 carries it
   switched off: My memories has no Replace button, and Delete's question
   doesn't point to it (removal.ts). Nothing else changes: the shrink, the
   album's quality and length stay, tested (replaceVideo.ts). The website
   has the same switch (src/lib/replaceVideoSwitch.ts). Turning it on is
   this line. */
export const REPLACE_VIDEO_ON = false;

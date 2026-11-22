/* Replace video in My Memories, on or off (the app's switch:
   mobile/src/lib/memories/replaceVideo.ts REPLACE_VIDEO_ON). Owner,
   2026-11-21: Replace is a fix for a complaint ("my video is blurry", "it's
   the wrong video"), not something to show off; "add that feature in .5 but
   disable it for now", and on the website too ("Yes, hide it"). Off: My
   Memories has no Replace button, and Delete's question doesn't point to
   it. Nothing is deleted; turning it back on is this line. */
export const REPLACE_VIDEO_ON = false;

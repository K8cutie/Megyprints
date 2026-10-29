/* The 2.0 page renderer: one album page (and the cover file) drawn by the
   app with Skia, the way the website's print renderer draws it. See
   pagePlan.ts (what goes where on a page), drawPage.ts (the drawing),
   pageText.ts (the words), textureTile.ts (page textures), coverPlan.ts and
   drawCover.ts (the cover file), assets.ts (QR codes, graphics, mask edges)
   and the golden check that holds it to the website
   (../../test/goldenPages.test.ts). */
export { planPage, type PagePlan, type PlanInput, type PlanItem } from './pagePlan';
export { PageDrawer, type AssetSource, type DrawOptions, type PhotoSource } from './drawPage';
export { PageText, type FontFile, type TextLook } from './pageText';
export { planCover, type CoverInput, type CoverPlan, type CoverStep, type CoverLine, type CoverMeasure } from './coverPlan';
export { CoverDrawer, appCoverWords, type CoverDrawOptions } from './drawCover';
export { AssetCache, dataUrlBytes, fromBase64 } from './assets';
export { makeTextureTile, textureTilePx } from './textureTile';
export { BUNDLED_FONTS, bundledFace, familyFaces, familyList, fontFileFor, fontNotDrawn, hasExactFont, paragraphFamilies, type BundledFont } from './fontTable';

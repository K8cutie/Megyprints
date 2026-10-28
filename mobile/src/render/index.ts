/* The 2.0 page renderer: one album page drawn by the app with Skia, the way
   the website's print renderer draws it. See pagePlan.ts (what goes where),
   drawPage.ts (the drawing), pageText.ts (the words) and the golden check
   that holds it to the website (../../test/goldenPages.test.ts). */
export { planPage, type PagePlan, type PlanInput, type PlanItem } from './pagePlan';
export { PageDrawer, type DrawOptions, type PhotoSource } from './drawPage';
export { PageText, type FontFile, type TextLook } from './pageText';
export { BUNDLED_FONTS, bundledFace, familyFaces, familyList, fontFileFor, fontNotDrawn, hasExactFont, paragraphFamilies, type BundledFont } from './fontTable';

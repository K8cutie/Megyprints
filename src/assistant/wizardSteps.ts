/* The steps of making an album, as Megy's guide names them. Moved here
   unchanged from wizard.ts so the 2.0 app's album builder (useBuilderState)
   can say which step it is on (src/shared/sharedModules.ts); wizard.ts
   re-exports it, so the website imports it from there as before. */

export type WizardStep =
  | 'welcome'
  | 'pick_theme'
  | 'pick_size'
  | 'design_cover'
  | 'upload_photos'
  | 'review_pages'
  | 'add_text'
  | 'finalize';

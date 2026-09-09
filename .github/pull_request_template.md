<!--
Main is the live product. A PR is the only way anything reaches it, and the
`verify` check must be green before the merge button unlocks. This checklist
is the human half of "proven and tested". Delete lines that don't apply.
-->

## What this changes

<!-- One paragraph. What a customer or the operator will notice. -->

## Proof it works

- [ ] `verify` is green (unit tests, typecheck, production build)
- [ ] Walked it on the Vercel **preview** URL on a real phone, not just the desktop pane
- [ ] Any new security surface was red-teamed (public endpoint, storage policy, RLS, resolver)

## If this is v2 engine work (fit-to-layout / curation)

- [ ] **Unlock rate** measured on the test pools and recorded here: ____ % of square photos score ≥ 0.92 in a 3:2 slot
- [ ] **Group-photo regression set** (20 real class / reunion photos): every one is deferred or lands in the widest slot — none is cropped through a person
- [ ] **Heroes-kept rate** (curation only): ____ % of promoted spreads kept unchanged through checkout
- [ ] Data model unchanged — crops write to `slotOffsetsX/Y` + `slotScales`; no migration required
- [ ] No paid AI call runs on the free path or on first generation

## Database

- [ ] This PR adds **no** migrations
- [ ] …or it does, and applying them is a separate deliberate step I will run from main with `npm run db:push` after merge

## Rollback

<!-- How to undo this if it's wrong in production. Usually: revert this PR;
     Vercel → Deployments → promote the previous build. Release tags mark
     known-good points (`git tag -l 'v*'`). -->

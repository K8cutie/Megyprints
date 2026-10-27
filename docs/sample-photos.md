# Sample photos (testing phase)

`public/sample-photos/megy-sample-01.jpg` … `megy-sample-78.jpg` are the photos a tester can add in the Android app when they have fewer than 40 of their own, and the photos in Step 1's "Make a sample album" (`src/lib/samplePhotos.ts`, owner 2026-10-28). They show only while `TESTING_PHASE` in `src/lib/testingPhase.ts` is on. That is the same switch as the "For Testing purposes" stamp.

## A different sample album every day of the test

Owner: "increase the sample photo pool so the youre done shows something different every day. its a 14 day test".

- **01–64 are everyday photos.** Each day's sample album takes 39 of them, picked for that day.
- **65–78 are 14 "end of the day" photos, one per day.** The day's one goes on the album's last page, under "You're done with today's test!". Over any 14 days in a row, no two days show the same one.
- **The same day always gives the same album.** The day changes at the phone's midnight.
- **"Add 25 sample photos" uses everyday photos only.** That's for an album that has photos of its own.

## Where they come from

All 78 are free photos from Unsplash, used under the [Unsplash License](https://unsplash.com/license): free to use, no permission or credit needed. Only free photos were used, not Unsplash+.

Each one was re-encoded at most 1600 px on its long side (about 250 KB) with no metadata from the source. One EXIF field was written: `DateTimeOriginal`, on 2026-10-25: the everyday photos from 7:40 AM to 8:45 PM, the end-of-day photos from 8:55 PM to 9:34 PM. That way the album puts them in the order of one day out: park, beach, a birthday, grandparents, dinner, friends, then the end of the day. `samplePhotos.spec.ts` checks the files, the sizes and that order.

41 are landscape and 37 portrait, so every album size has the full-page photos its video memories need.

| File | Kind | Shape | Source |
|---|---|---|---|
| megy-sample-01.jpg | everyday | portrait | https://images.unsplash.com/photo-1770871821382-60ea99b0a941 |
| megy-sample-02.jpg | everyday | portrait | https://images.unsplash.com/photo-1603367563698-67012943fd67 |
| megy-sample-03.jpg | everyday | landscape | https://images.unsplash.com/photo-1761839258657-457dda39b5cc |
| megy-sample-04.jpg | everyday | portrait | https://images.unsplash.com/photo-1756526511266-00ddcf925418 |
| megy-sample-05.jpg | everyday | portrait | https://images.unsplash.com/photo-1761257517694-8f76923e2b1e |
| megy-sample-06.jpg | everyday | landscape | https://images.unsplash.com/photo-1681311311317-a0561a8eef74 |
| megy-sample-07.jpg | everyday | landscape | https://images.unsplash.com/photo-1627764940620-90393d0e8c34 |
| megy-sample-08.jpg | everyday | landscape | https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2 |
| megy-sample-09.jpg | everyday | landscape | https://images.unsplash.com/photo-1527821468487-b724210d296a |
| megy-sample-10.jpg | everyday | portrait | https://images.unsplash.com/photo-1607453998774-d533f65dac99 |
| megy-sample-11.jpg | everyday | landscape | https://images.unsplash.com/photo-1552873816-636e43209957 |
| megy-sample-12.jpg | everyday | landscape | https://images.unsplash.com/photo-1524503033411-c9566986fc8f |
| megy-sample-13.jpg | everyday | landscape | https://images.unsplash.com/photo-1585735197098-b96a813183c6 |
| megy-sample-14.jpg | everyday | landscape | https://images.unsplash.com/photo-1609220136736-443140cffec6 |
| megy-sample-15.jpg | everyday | landscape | https://images.unsplash.com/photo-1772305436753-e308844ecda2 |
| megy-sample-16.jpg | everyday | landscape | https://images.unsplash.com/photo-1531983412531-1f49a365ffed |
| megy-sample-17.jpg | everyday | landscape | https://images.unsplash.com/photo-1597524678053-5e6fef52d8a3 |
| megy-sample-18.jpg | everyday | portrait | https://images.unsplash.com/photo-1656177999031-0d3e8e62317a |
| megy-sample-19.jpg | everyday | portrait | https://images.unsplash.com/photo-1611024847487-e26177381a3f |
| megy-sample-20.jpg | everyday | landscape | https://images.unsplash.com/photo-1685580388390-576100ae9ce3 |
| megy-sample-21.jpg | everyday | landscape | https://images.unsplash.com/photo-1780980301761-f6e0fa6f0bdf |
| megy-sample-22.jpg | everyday | landscape | https://images.unsplash.com/photo-1598845243320-c43cf5fd4af9 |
| megy-sample-23.jpg | everyday | landscape | https://images.unsplash.com/photo-1509666537727-9154b6962292 |
| megy-sample-24.jpg | everyday | portrait | https://images.unsplash.com/photo-1766770301468-0fff596420b0 |
| megy-sample-25.jpg | everyday | portrait | https://images.unsplash.com/photo-1607977229409-8c278bc34628 |
| megy-sample-26.jpg | everyday | portrait | https://images.unsplash.com/photo-1608790672275-309c02d888ff |
| megy-sample-27.jpg | everyday | landscape | https://images.unsplash.com/photo-1516668557604-c8e814fdb184 |
| megy-sample-28.jpg | everyday | portrait | https://images.unsplash.com/photo-1586498024141-1940debde48d |
| megy-sample-29.jpg | everyday | portrait | https://images.unsplash.com/photo-1652300353103-490b43ac8366 |
| megy-sample-30.jpg | everyday | portrait | https://images.unsplash.com/photo-1742696405936-fe5ef4f37b4b |
| megy-sample-31.jpg | everyday | landscape | https://images.unsplash.com/photo-1593100126453-19b562a800c1 |
| megy-sample-32.jpg | everyday | landscape | https://images.unsplash.com/photo-1647833202056-e6e67293ba81 |
| megy-sample-33.jpg | everyday | landscape | https://images.unsplash.com/photo-1662987619545-1844207dedac |
| megy-sample-34.jpg | everyday | landscape | https://images.unsplash.com/photo-1577897113292-3b95936e5206 |
| megy-sample-35.jpg | everyday | landscape | https://images.unsplash.com/photo-1757926068119-b2001d25dc9a |
| megy-sample-36.jpg | everyday | landscape | https://images.unsplash.com/photo-1772306096779-e0e4908b25ef |
| megy-sample-37.jpg | everyday | landscape | https://images.unsplash.com/photo-1589169011402-8b2cbd1ee593 |
| megy-sample-38.jpg | everyday | portrait | https://images.unsplash.com/photo-1624448445915-97154f5e688c |
| megy-sample-39.jpg | everyday | landscape | https://images.unsplash.com/photo-1761839258568-fd466a93f68b |
| megy-sample-40.jpg | everyday | landscape | https://images.unsplash.com/photo-1761839258803-21515f43190c |
| megy-sample-41.jpg | everyday | portrait | https://images.unsplash.com/photo-1627662166825-a860471632e4 |
| megy-sample-42.jpg | everyday | landscape | https://images.unsplash.com/photo-1576089073624-b5751a8f4de9 |
| megy-sample-43.jpg | everyday | landscape | https://images.unsplash.com/photo-1578496780896-7081cc23c111 |
| megy-sample-44.jpg | everyday | landscape | https://images.unsplash.com/photo-1767617774446-5bb3ce40824d |
| megy-sample-45.jpg | everyday | portrait | https://images.unsplash.com/photo-1582298538104-fe2e74c27f59 |
| megy-sample-46.jpg | everyday | portrait | https://images.unsplash.com/photo-1607748862156-7c548e7e98f4 |
| megy-sample-47.jpg | everyday | portrait | https://images.unsplash.com/photo-1625283518288-00362afc8663 |
| megy-sample-48.jpg | everyday | portrait | https://images.unsplash.com/photo-1764267704086-261af367c19f |
| megy-sample-49.jpg | everyday | landscape | https://images.unsplash.com/photo-1791770964210-184812397ccc |
| megy-sample-50.jpg | everyday | portrait | https://images.unsplash.com/photo-1605713288610-00c1c630ca1e |
| megy-sample-51.jpg | everyday | landscape | https://images.unsplash.com/photo-1758613171860-99ef6386e33f |
| megy-sample-52.jpg | everyday | portrait | https://images.unsplash.com/photo-1624272864537-8ecc72b67958 |
| megy-sample-53.jpg | everyday | portrait | https://images.unsplash.com/photo-1759261294980-8b717bd531f2 |
| megy-sample-54.jpg | everyday | landscape | https://images.unsplash.com/photo-1758598737723-01be406c09e7 |
| megy-sample-55.jpg | everyday | landscape | https://images.unsplash.com/photo-1758612897487-41d0c44c4420 |
| megy-sample-56.jpg | everyday | landscape | https://images.unsplash.com/photo-1605812830455-2fadc55bc4ba |
| megy-sample-57.jpg | everyday | portrait | https://images.unsplash.com/photo-1590527548172-295fdcb1bab0 |
| megy-sample-58.jpg | everyday | portrait | https://images.unsplash.com/photo-1537069562298-f7416f8a60f0 |
| megy-sample-59.jpg | everyday | portrait | https://images.unsplash.com/photo-1580130509744-c3aefbe32c7b |
| megy-sample-60.jpg | everyday | portrait | https://images.unsplash.com/photo-1773163538230-98f9182c1e64 |
| megy-sample-61.jpg | everyday | landscape | https://images.unsplash.com/photo-1776710898709-3b378a13b980 |
| megy-sample-62.jpg | everyday | landscape | https://images.unsplash.com/photo-1674230316788-d9c8b92f0d63 |
| megy-sample-63.jpg | everyday | portrait | https://images.unsplash.com/photo-1701047018936-fe557ef2c98a |
| megy-sample-64.jpg | everyday | landscape | https://images.unsplash.com/photo-1704243448244-e49c48ade9b4 |
| megy-sample-65.jpg | end of the day | landscape | https://images.unsplash.com/photo-1665827491450-c6f329f2285c |
| megy-sample-66.jpg | end of the day | portrait | https://images.unsplash.com/photo-1756982477754-2c05a288f4db |
| megy-sample-67.jpg | end of the day | portrait | https://images.unsplash.com/photo-1756142006143-e0423bced11f |
| megy-sample-68.jpg | end of the day | landscape | https://images.unsplash.com/photo-1758275557315-53f66f57119a |
| megy-sample-69.jpg | end of the day | portrait | https://images.unsplash.com/photo-1681311311149-7254102442de |
| megy-sample-70.jpg | end of the day | portrait | https://images.unsplash.com/photo-1643130420837-811817d8d1ce |
| megy-sample-71.jpg | end of the day | landscape | https://images.unsplash.com/photo-1643240143978-9563c3760ca4 |
| megy-sample-72.jpg | end of the day | portrait | https://images.unsplash.com/photo-1738748710157-698869ce0ad9 |
| megy-sample-73.jpg | end of the day | portrait | https://images.unsplash.com/photo-1663058513323-ee4209b7a317 |
| megy-sample-74.jpg | end of the day | portrait | https://images.unsplash.com/photo-1666819256222-7034f91340a7 |
| megy-sample-75.jpg | end of the day | portrait | https://images.unsplash.com/photo-1756982784269-0c450fc84bba |
| megy-sample-76.jpg | end of the day | portrait | https://images.unsplash.com/photo-1627007410492-f410bb5ae2d6 |
| megy-sample-77.jpg | end of the day | landscape | https://images.unsplash.com/photo-1772723246543-213f2a4fc526 |
| megy-sample-78.jpg | end of the day | portrait | https://images.unsplash.com/photo-1763013259279-3195d6330519 |

## Before production

Set `TESTING_PHASE = false`. The offer and the stamp both go away. The files can stay or be deleted. Nothing else reads them.

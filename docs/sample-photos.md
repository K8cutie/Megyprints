# Sample photos (testing phase)

`public/sample-photos/megy-sample-01.jpg` … `megy-sample-48.jpg` are the photos a tester can add in the Android app when they have fewer than 40 of their own (`src/lib/samplePhotos.ts`, owner 2026-10-28). They show only while `TESTING_PHASE` in `src/lib/testingPhase.ts` is on. That is the same switch as the "For Testing purposes" stamp.

## Where they come from

All 48 are free photos from Unsplash, used under the [Unsplash License](https://unsplash.com/license): free to use, no permission or credit needed. Only free photos were used, not Unsplash+.

Each one was re-encoded at most 1600 px on its long side (about 250 KB) with no metadata from the source. One EXIF field was written: `DateTimeOriginal`, on 2026-10-25 from 7:40 AM to 7:35 PM, about 15 minutes apart. That way the album puts them in the order of one day out: park, beach, a birthday, grandparents, dinner, friends. `samplePhotos.spec.ts` checks the files, the sizes and that order.

29 are landscape and 19 portrait, so every album size has the full-page photos its video memories need.

| File | Shape | Source |
|---|---|---|
| megy-sample-01.jpg | portrait | https://images.unsplash.com/photo-1770871821382-60ea99b0a941 |
| megy-sample-02.jpg | portrait | https://images.unsplash.com/photo-1603367563698-67012943fd67 |
| megy-sample-03.jpg | landscape | https://images.unsplash.com/photo-1761839258657-457dda39b5cc |
| megy-sample-04.jpg | portrait | https://images.unsplash.com/photo-1756526511266-00ddcf925418 |
| megy-sample-05.jpg | portrait | https://images.unsplash.com/photo-1761257517694-8f76923e2b1e |
| megy-sample-06.jpg | landscape | https://images.unsplash.com/photo-1681311311317-a0561a8eef74 |
| megy-sample-07.jpg | landscape | https://images.unsplash.com/photo-1627764940620-90393d0e8c34 |
| megy-sample-08.jpg | landscape | https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2 |
| megy-sample-09.jpg | landscape | https://images.unsplash.com/photo-1527821468487-b724210d296a |
| megy-sample-10.jpg | portrait | https://images.unsplash.com/photo-1607453998774-d533f65dac99 |
| megy-sample-11.jpg | landscape | https://images.unsplash.com/photo-1552873816-636e43209957 |
| megy-sample-12.jpg | landscape | https://images.unsplash.com/photo-1524503033411-c9566986fc8f |
| megy-sample-13.jpg | landscape | https://images.unsplash.com/photo-1585735197098-b96a813183c6 |
| megy-sample-14.jpg | landscape | https://images.unsplash.com/photo-1609220136736-443140cffec6 |
| megy-sample-15.jpg | landscape | https://images.unsplash.com/photo-1772305436753-e308844ecda2 |
| megy-sample-16.jpg | landscape | https://images.unsplash.com/photo-1531983412531-1f49a365ffed |
| megy-sample-17.jpg | landscape | https://images.unsplash.com/photo-1597524678053-5e6fef52d8a3 |
| megy-sample-18.jpg | portrait | https://images.unsplash.com/photo-1656177999031-0d3e8e62317a |
| megy-sample-19.jpg | portrait | https://images.unsplash.com/photo-1611024847487-e26177381a3f |
| megy-sample-20.jpg | landscape | https://images.unsplash.com/photo-1685580388390-576100ae9ce3 |
| megy-sample-21.jpg | landscape | https://images.unsplash.com/photo-1780980301761-f6e0fa6f0bdf |
| megy-sample-22.jpg | landscape | https://images.unsplash.com/photo-1598845243320-c43cf5fd4af9 |
| megy-sample-23.jpg | landscape | https://images.unsplash.com/photo-1509666537727-9154b6962292 |
| megy-sample-24.jpg | portrait | https://images.unsplash.com/photo-1766770301468-0fff596420b0 |
| megy-sample-25.jpg | portrait | https://images.unsplash.com/photo-1607977229409-8c278bc34628 |
| megy-sample-26.jpg | portrait | https://images.unsplash.com/photo-1608790672275-309c02d888ff |
| megy-sample-27.jpg | landscape | https://images.unsplash.com/photo-1516668557604-c8e814fdb184 |
| megy-sample-28.jpg | portrait | https://images.unsplash.com/photo-1586498024141-1940debde48d |
| megy-sample-29.jpg | portrait | https://images.unsplash.com/photo-1652300353103-490b43ac8366 |
| megy-sample-30.jpg | portrait | https://images.unsplash.com/photo-1742696405936-fe5ef4f37b4b |
| megy-sample-31.jpg | landscape | https://images.unsplash.com/photo-1593100126453-19b562a800c1 |
| megy-sample-32.jpg | landscape | https://images.unsplash.com/photo-1647833202056-e6e67293ba81 |
| megy-sample-33.jpg | landscape | https://images.unsplash.com/photo-1662987619545-1844207dedac |
| megy-sample-34.jpg | landscape | https://images.unsplash.com/photo-1577897113292-3b95936e5206 |
| megy-sample-35.jpg | landscape | https://images.unsplash.com/photo-1757926068119-b2001d25dc9a |
| megy-sample-36.jpg | landscape | https://images.unsplash.com/photo-1772306096779-e0e4908b25ef |
| megy-sample-37.jpg | landscape | https://images.unsplash.com/photo-1589169011402-8b2cbd1ee593 |
| megy-sample-38.jpg | portrait | https://images.unsplash.com/photo-1624448445915-97154f5e688c |
| megy-sample-39.jpg | landscape | https://images.unsplash.com/photo-1761839258568-fd466a93f68b |
| megy-sample-40.jpg | landscape | https://images.unsplash.com/photo-1761839258803-21515f43190c |
| megy-sample-41.jpg | portrait | https://images.unsplash.com/photo-1627662166825-a860471632e4 |
| megy-sample-42.jpg | landscape | https://images.unsplash.com/photo-1576089073624-b5751a8f4de9 |
| megy-sample-43.jpg | landscape | https://images.unsplash.com/photo-1578496780896-7081cc23c111 |
| megy-sample-44.jpg | landscape | https://images.unsplash.com/photo-1767617774446-5bb3ce40824d |
| megy-sample-45.jpg | portrait | https://images.unsplash.com/photo-1582298538104-fe2e74c27f59 |
| megy-sample-46.jpg | portrait | https://images.unsplash.com/photo-1607748862156-7c548e7e98f4 |
| megy-sample-47.jpg | portrait | https://images.unsplash.com/photo-1625283518288-00362afc8663 |
| megy-sample-48.jpg | portrait | https://images.unsplash.com/photo-1764267704086-261af367c19f |

## Before production

Set `TESTING_PHASE = false`. The offer and the stamp both go away. The files can stay or be deleted. Nothing else reads them.

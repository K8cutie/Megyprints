// jest-expo runs the tests the way the app runs its code (React Native
// preset, Expo's Babel). '@web/…' is the website's src folder, as in Metro.
const path = require('node:path');

const here = (p) => path.join(__dirname, p);

module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/test'],
  // The golden tests (three files, run side by side) read the website
  // pictures: made, when out of date, once before any of them starts.
  globalSetup: '<rootDir>/test/golden/webPictures.cjs',
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  moduleNameMapper: {
    '^@web/(.*)$': '<rootDir>/../src/$1',
    // The golden test pages are only in a -GoldenPages build (goldenPages.js).
    '^megy-golden-pages$': '<rootDir>/src/dev/noGoldenPages.json',
    // A website file that imports React gets the app's React (one copy).
    '^react$': here('node_modules/react'),
    '^react/(.*)$': here('node_modules/react/$1'),
  },
};

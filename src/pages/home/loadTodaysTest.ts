/* Today's test (home/TodaysTest) is its own chunk: the website never
   downloads it. Home's "Make today's sample album" and Step 1's "Make a
   sample album" both open it (TodaysTestScreen), and load it early, so it
   opens at once. */
export const loadTodaysTest = () => import('./TodaysTest');

package com.megyprints.app;

/**
 * The two choices behind {@link AppUpdatePrompt}: show Google Play's update sheet now, and
 * show "A new version of Megy Prints is ready." now.
 *
 * Plain Java with no Android imports, so the rules run as JUnit tests (UpdateDecisionTest)
 * without a phone. The numbers are Google Play's own (UpdateAvailability, InstallStatus);
 * UpdateDecisionTest checks they still match the library.
 */
final class UpdateDecision {

    // UpdateAvailability
    static final int UPDATE_AVAILABLE = 2;

    // InstallStatus
    static final int PENDING = 1;
    static final int DOWNLOADING = 2;
    static final int INSTALLING = 3;
    static final int DOWNLOADED = 11;

    /**
     * How long "Later" holds: 4 hours. MainActivity can live for days (from Android 12, Back on
     * the app's first screen only moves the app to the background), so "until the next launch"
     * could mean the update never goes in.
     */
    static final long LATER_WAIT_MS = 4L * 60 * 60 * 1000;

    /** laterAtMs when "Later" has not been tapped. */
    static final long NEVER = -1;

    private UpdateDecision() {}

    /**
     * Ask about the new version? Only while the app is on screen, so Google's sheet never opens
     * on top of the photo picker or the sign-in tab. Once per launch: a "no" holds until the
     * next launch. Never while a download is already under way (the person already said yes).
     */
    static boolean shouldStartFlow(int updateAvailability, boolean flexibleAllowed, int installStatus, boolean onScreen, boolean askedThisLaunch) {
        if (!onScreen || askedThisLaunch) return false;
        if (updateAvailability != UPDATE_AVAILABLE || !flexibleAllowed) return false;
        return !isUnderWay(installStatus);
    }

    /**
     * Say the new version is ready? Only once it is downloaded and the app is on screen, never
     * twice at once, and not for {@link #LATER_WAIT_MS} after "Later" (or the person would see
     * it every time they come back from the photo picker).
     *
     * @param laterAtMs when "Later" was tapped (SystemClock.elapsedRealtime), or {@link #NEVER}
     * @param nowMs SystemClock.elapsedRealtime now
     */
    static boolean shouldShowReadyDialog(int installStatus, boolean onScreen, boolean dialogShowing, long laterAtMs, long nowMs) {
        return installStatus == DOWNLOADED && onScreen && !dialogShowing && !laterHolds(laterAtMs, nowMs);
    }

    static boolean laterHolds(long laterAtMs, long nowMs) {
        return laterAtMs != NEVER && nowMs - laterAtMs < LATER_WAIT_MS;
    }

    private static boolean isUnderWay(int installStatus) {
        return installStatus == PENDING
            || installStatus == DOWNLOADING
            || installStatus == DOWNLOADED
            || installStatus == INSTALLING;
    }
}

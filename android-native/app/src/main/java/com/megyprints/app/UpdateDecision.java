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

    private UpdateDecision() {}

    /**
     * Ask about the new version? Once per launch: a "no" holds until the next launch.
     * Never while a download is already under way (asking again would start it over).
     */
    static boolean shouldStartFlow(int updateAvailability, boolean flexibleAllowed, int installStatus, boolean askedThisLaunch) {
        if (askedThisLaunch) return false;
        if (updateAvailability != UPDATE_AVAILABLE || !flexibleAllowed) return false;
        return !isUnderWay(installStatus);
    }

    /**
     * Say the new version is ready? Only once it is downloaded and the app is on screen, never
     * twice at once, and not again this launch after "Later" (or the person would see it every
     * time they come back from the photo picker).
     */
    static boolean shouldShowReadyDialog(int installStatus, boolean onScreen, boolean dialogShowing, boolean laterThisLaunch) {
        return installStatus == DOWNLOADED && onScreen && !dialogShowing && !laterThisLaunch;
    }

    private static boolean isUnderWay(int installStatus) {
        return installStatus == PENDING
            || installStatus == DOWNLOADING
            || installStatus == DOWNLOADED
            || installStatus == INSTALLING;
    }
}

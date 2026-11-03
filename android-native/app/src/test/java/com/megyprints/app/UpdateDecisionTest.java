package com.megyprints.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import org.junit.Test;

/** The rules behind the 1.4.0 update prompt (AppUpdatePrompt), checked without a phone. */
public class UpdateDecisionTest {

    private static final boolean ALLOWED = true;
    private static final boolean ON_SCREEN = true;
    private static final boolean NOT_ASKED = false;
    private static final long NOW = 50_000_000L; // SystemClock.elapsedRealtime, some time after boot
    private static final long NO_LATER = UpdateDecision.NEVER;

    @Test
    public void numbersMatchGooglePlay() {
        assertEquals(UpdateAvailability.UPDATE_AVAILABLE, UpdateDecision.UPDATE_AVAILABLE);
        assertEquals(InstallStatus.PENDING, UpdateDecision.PENDING);
        assertEquals(InstallStatus.DOWNLOADING, UpdateDecision.DOWNLOADING);
        assertEquals(InstallStatus.INSTALLING, UpdateDecision.INSTALLING);
        assertEquals(InstallStatus.DOWNLOADED, UpdateDecision.DOWNLOADED);
    }

    // Asking about a new version (Google's sheet)

    @Test
    public void asksWhenANewVersionIsOut() {
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, ON_SCREEN, NOT_ASKED));
    }

    @Test
    public void doesNotAskWhenNotOnScreen() {
        // The check came back after they left for the photo picker or the sign-in tab:
        // Google's sheet must not open on top of it. The next onResume asks.
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, false, NOT_ASKED));
    }

    @Test
    public void asksOnlyOncePerLaunch() {
        // They said no: not again until the next launch.
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, ON_SCREEN, true));
    }

    @Test
    public void doesNotAskWithoutANewVersion() {
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UNKNOWN, ALLOWED, InstallStatus.UNKNOWN, ON_SCREEN, NOT_ASKED));
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_NOT_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, ON_SCREEN, NOT_ASKED));
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS, ALLOWED, InstallStatus.UNKNOWN, ON_SCREEN, NOT_ASKED));
    }

    @Test
    public void doesNotAskWhenPlayDoesNotAllowTheFlexibleFlow() {
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, false, InstallStatus.UNKNOWN, ON_SCREEN, NOT_ASKED));
    }

    @Test
    public void doesNotAskWhileADownloadIsUnderWay() {
        int[] underWay = { InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.DOWNLOADED, InstallStatus.INSTALLING };
        for (int status : underWay) {
            assertFalse("install status " + status, UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, status, ON_SCREEN, NOT_ASKED));
        }
    }

    @Test
    public void asksAgainAfterAFailedOrCanceledDownloadOnTheNextLaunch() {
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.FAILED, ON_SCREEN, NOT_ASKED));
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.CANCELED, ON_SCREEN, NOT_ASKED));
    }

    // "A new version of Megy Prints is ready."

    @Test
    public void saysReadyOnceDownloaded() {
        assertTrue(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, false, NO_LATER, NOW));
    }

    @Test
    public void doesNotSayReadyBeforeTheDownloadIsIn() {
        int[] notYet = {
            InstallStatus.UNKNOWN, InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.INSTALLING,
            InstallStatus.INSTALLED, InstallStatus.FAILED, InstallStatus.CANCELED,
        };
        for (int status : notYet) {
            assertFalse("install status " + status, UpdateDecision.shouldShowReadyDialog(status, ON_SCREEN, false, NO_LATER, NOW));
        }
    }

    @Test
    public void waitsUntilTheAppIsOnScreen() {
        // In the photo picker, say: the box comes when they are back.
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, false, false, NO_LATER, NOW));
    }

    @Test
    public void neverTwoBoxesAtOnce() {
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, true, NO_LATER, NOW));
    }

    @Test
    public void laterHoldsForFourHours() {
        assertEquals(4L * 60 * 60 * 1000, UpdateDecision.LATER_WAIT_MS);
        long laterAt = NOW;
        // Back from the photo picker a minute later, or nearly 4 hours later: still quiet.
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, false, laterAt, laterAt + 60_000));
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, false, laterAt, laterAt + UpdateDecision.LATER_WAIT_MS - 1));
    }

    @Test
    public void laterEndsAfterFourHoursEvenIfTheAppWasNeverClosed() {
        // Back on the first screen only moves the app to the background, so the same screen can
        // live for days. The downloaded update must not wait that long without a word.
        long laterAt = NOW;
        assertTrue(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, false, laterAt, laterAt + UpdateDecision.LATER_WAIT_MS));
        assertTrue(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, ON_SCREEN, false, laterAt, laterAt + 3L * 24 * 60 * 60 * 1000));
    }

    @Test
    public void laterHoldsOnlyAfterItWasTapped() {
        assertFalse(UpdateDecision.laterHolds(NO_LATER, NOW));
        assertFalse(UpdateDecision.laterHolds(NO_LATER, 0));
        assertTrue(UpdateDecision.laterHolds(NOW, NOW));
    }
}

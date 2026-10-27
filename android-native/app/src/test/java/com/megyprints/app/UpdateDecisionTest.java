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
    private static final boolean NOT_ASKED = false;

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
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, NOT_ASKED));
    }

    @Test
    public void asksOnlyOncePerLaunch() {
        // They said no: not again until the next launch.
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, true));
    }

    @Test
    public void doesNotAskWithoutANewVersion() {
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UNKNOWN, ALLOWED, InstallStatus.UNKNOWN, NOT_ASKED));
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_NOT_AVAILABLE, ALLOWED, InstallStatus.UNKNOWN, NOT_ASKED));
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS, ALLOWED, InstallStatus.UNKNOWN, NOT_ASKED));
    }

    @Test
    public void doesNotAskWhenPlayDoesNotAllowTheFlexibleFlow() {
        assertFalse(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, false, InstallStatus.UNKNOWN, NOT_ASKED));
    }

    @Test
    public void doesNotAskWhileADownloadIsUnderWay() {
        int[] underWay = { InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.DOWNLOADED, InstallStatus.INSTALLING };
        for (int status : underWay) {
            assertFalse("install status " + status, UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, status, NOT_ASKED));
        }
    }

    @Test
    public void asksAgainAfterAFailedOrCanceledDownloadOnTheNextLaunch() {
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.FAILED, NOT_ASKED));
        assertTrue(UpdateDecision.shouldStartFlow(UpdateAvailability.UPDATE_AVAILABLE, ALLOWED, InstallStatus.CANCELED, NOT_ASKED));
    }

    // "A new version of Megy Prints is ready."

    @Test
    public void saysReadyOnceDownloaded() {
        assertTrue(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, true, false, false));
    }

    @Test
    public void doesNotSayReadyBeforeTheDownloadIsIn() {
        int[] notYet = {
            InstallStatus.UNKNOWN, InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.INSTALLING,
            InstallStatus.INSTALLED, InstallStatus.FAILED, InstallStatus.CANCELED,
        };
        for (int status : notYet) {
            assertFalse("install status " + status, UpdateDecision.shouldShowReadyDialog(status, true, false, false));
        }
    }

    @Test
    public void waitsUntilTheAppIsOnScreen() {
        // In the photo picker, say: the box comes when they are back.
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, false, false, false));
    }

    @Test
    public void neverTwoBoxesAtOnce() {
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, true, true, false));
    }

    @Test
    public void laterHoldsUntilTheNextLaunch() {
        assertFalse(UpdateDecision.shouldShowReadyDialog(InstallStatus.DOWNLOADED, true, false, true));
    }
}

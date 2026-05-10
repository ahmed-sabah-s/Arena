import type { JobDefinition } from '../scheduler.runner.js';
import { matchForfeitSweepJob } from './matchForfeitSweep.js';
import { matchInviteExpiryJob } from './matchInviteExpiry.js';
import { refereeCheckInWindowJob } from './refereeCheckInWindow.js';
import { refereeAutoPromotionJob } from './refereeAutoPromotion.js';
import { notificationDeliveryJob } from './notificationDelivery.js';
import { bookingNoShowSweepJob } from './bookingNoShowSweep.js';
import { otpExpirySweepJob } from './otpExpirySweep.js';
import { otpRetentionCleanupJob } from './otpRetentionCleanup.js';

/**
 * Phase 8 job registry. Order doesn't matter functionally but is grouped
 * here by concern: match resolution, referee lifecycle, notification
 * delivery, booking lifecycle, OTP cleanup.
 *
 * Note: `referee_reclaim_expiry` was deliberately NOT added — Phase 8
 * pushes the reclaim time-gate inline into RefereeAssignmentService.reclaim
 * MainSlot rather than running a sweep. See phase-6 carry-forward.
 */
export const jobRegistry: JobDefinition[] = [
  matchForfeitSweepJob,
  matchInviteExpiryJob,
  refereeCheckInWindowJob,
  refereeAutoPromotionJob,
  notificationDeliveryJob,
  bookingNoShowSweepJob,
  otpExpirySweepJob,
  otpRetentionCleanupJob,
];

export {
  matchForfeitSweepJob,
  matchInviteExpiryJob,
  refereeCheckInWindowJob,
  refereeAutoPromotionJob,
  notificationDeliveryJob,
  bookingNoShowSweepJob,
  otpExpirySweepJob,
  otpRetentionCleanupJob,
};

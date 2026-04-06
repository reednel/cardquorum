/**
 * Pure function that maps a session's current status and cancellation type
 * to the resulting final status.
 *
 * - waiting + owner-cancel → cancelled
 * - active  + owner-cancel → aborted
 * - waiting + room-delete  → cancelled
 * - active  + room-delete  → abandoned
 */
export function resolveCancellationStatus(
  currentStatus: 'waiting' | 'active',
  cancellationType: 'owner-cancel' | 'room-delete',
): 'cancelled' | 'aborted' | 'abandoned' {
  if (currentStatus === 'waiting') {
    return 'cancelled';
  }
  // currentStatus === 'active'
  return cancellationType === 'owner-cancel' ? 'aborted' : 'abandoned';
}

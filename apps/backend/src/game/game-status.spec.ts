import * as fc from 'fast-check';
import { resolveCancellationStatus } from './game-status';

describe('Session cancellation status mapping', () => {
  const statusArb = fc.constantFrom('waiting' as const, 'active' as const);
  const cancellationTypeArb = fc.constantFrom('owner-cancel' as const, 'room-delete' as const);

  it('should map (currentStatus, cancellationType) to the correct resulting status', () => {
    fc.assert(
      fc.property(statusArb, cancellationTypeArb, (currentStatus, cancellationType) => {
        const result = resolveCancellationStatus(currentStatus, cancellationType);

        if (currentStatus === 'waiting') {
          // waiting sessions always become cancelled regardless of cancellation type
          expect(result).toBe('cancelled');
        } else {
          // active sessions: owner-cancel → aborted, room-delete → abandoned
          if (cancellationType === 'owner-cancel') {
            expect(result).toBe('aborted');
          } else {
            expect(result).toBe('abandoned');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should always return one of the three valid final statuses', () => {
    fc.assert(
      fc.property(statusArb, cancellationTypeArb, (currentStatus, cancellationType) => {
        const result = resolveCancellationStatus(currentStatus, cancellationType);
        expect(['cancelled', 'aborted', 'abandoned']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });
});

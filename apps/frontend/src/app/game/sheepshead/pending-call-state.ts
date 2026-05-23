/**
 * Module-level state shared between the SheepsheadTable component and plugin
 * for the pending call value during the unknown ace flow.
 * Extracted to avoid circular dependencies.
 */
let _pendingCallValue: string | null = null;

export function getPendingCall(): string | null {
  return _pendingCallValue;
}

export function setPendingCall(value: string | null): void {
  _pendingCallValue = value;
}

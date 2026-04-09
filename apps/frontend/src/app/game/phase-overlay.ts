import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-phase-overlay',
  template: `
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
      role="dialog"
      [attr.aria-label]="label()"
    >
      <div class="rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <ng-content />
      </div>
    </div>
  `,
})
export class PhaseOverlay {
  readonly label = input('Game action');
}

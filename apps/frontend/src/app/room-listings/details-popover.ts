import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { RoomResponse } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-details-popover',
  imports: [FaIconComponent],
  template: `
    <div
      class="relative inline-flex"
      (mouseenter)="showPopover.set(true)"
      (mouseleave)="showPopover.set(false)"
    >
      <button
        type="button"
        data-testid="details-icon"
        class="inline-flex items-center rounded-default p-1 text-text-secondary
               hover:bg-surface-raised dark:text-text-secondary-dark
               dark:hover:bg-surface-dark"
        aria-label="Room details"
      >
        <fa-icon [icon]="faCircleInfo" class="text-lg" aria-hidden="true" />
      </button>

      @if (showPopover()) {
        <div
          data-testid="details-popover"
          role="tooltip"
          class="absolute left-1/2 top-full z-10 mt-1 w-56 -translate-x-1/2 rounded-default
                 border border-border bg-surface p-3 text-sm shadow-lg
                 dark:border-border-dark dark:bg-surface-dark"
        >
          <dl class="space-y-1.5">
            <div class="flex justify-between">
              <dt class="text-text-secondary dark:text-text-secondary-dark">Owner</dt>
              <dd class="font-medium text-text-heading dark:text-text-heading-dark">
                {{ room().ownerDisplayName || room().ownerUsername }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-text-secondary dark:text-text-secondary-dark">Visibility</dt>
              <dd class="font-medium text-text-heading dark:text-text-heading-dark">
                {{ room().visibility }}
              </dd>
            </div>
            @if (room().presetName) {
              <div class="flex justify-between">
                <dt class="text-text-secondary dark:text-text-secondary-dark">Game variant</dt>
                <dd class="font-medium text-text-heading dark:text-text-heading-dark">
                  {{ room().presetName }}
                </dd>
              </div>
            }
            @if (room().description) {
              <div>
                <dt class="text-text-secondary dark:text-text-secondary-dark">Description</dt>
                <dd class="mt-0.5 text-text-heading dark:text-text-heading-dark">
                  {{ room().description }}
                </dd>
              </div>
            }
          </dl>
        </div>
      }
    </div>
  `,
})
export class DetailsPopoverComponent {
  readonly room = input.required<RoomResponse>();
  readonly showPopover = signal(false);
  protected readonly faCircleInfo = faCircleInfo;
}

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-discover-page',
  template: `
    <div class="mx-auto max-w-4xl px-4 py-8">
      <h1
        data-testid="discover-title"
        class="mb-6 text-2xl font-bold text-text-heading dark:text-text-heading-dark"
      >
        Discover
      </h1>
      <p
        data-testid="discover-placeholder"
        class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
      >
        Coming soon.
      </p>
    </div>
  `,
})
export class DiscoverPage {}

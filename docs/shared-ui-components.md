# Shared UI Components

Reusable frontend components and utilities in `apps/frontend/src/app/shared/`.

## Multiselect Dropdown

**File:** `shared/multiselect-dropdown.ts`

A dropdown multiselect with checkboxes, "Select all" / "Clear" controls, and chip-style trigger label. Designed for cases with many options (10+) where a flat checkbox grid is unwieldy.

### Usage

```html
<app-multiselect-dropdown
  [options]="variantOptions"
  [selected]="selectedVariants()"
  label="Select variants"
  (selectionChange)="onVariantsChange($event)"
/>
```

### Inputs

| Input    | Type                               | Description              |
| -------- | ---------------------------------- | ------------------------ |
| options  | `{ key: string; label: string }[]` | Available options        |
| selected | `string[]`                         | Currently selected keys  |
| label    | `string`                           | ARIA label for the panel |

### Output

| Output          | Type       | Description                                                |
| --------------- | ---------- | ---------------------------------------------------------- |
| selectionChange | `string[]` | Emitted on any selection change (full new selection array) |

### Behavior

- Trigger shows "All" when nothing selected, single label when one selected, "N selected" otherwise
- Dropdown closes on click-outside or Escape
- "Select all" selects every option; "Clear" deselects all

## Flatpickr Date Picker

**Files:** `shared/flatpickr.directive.ts`, `shared/flatpickr-theme.css`

A directive that attaches [Flatpickr](https://flatpickr.js.org/) to any `<input>` element. The theme CSS overrides Flatpickr's defaults to match the app's design tokens and supports dark mode.

### Usage

```html
<input
  appFlatpickr
  [value]="startDate()"
  (dateChange)="onDateChange($event)"
  placeholder="Start date"
  class="rounded-default border border-border-input ..."
/>
```

### Inputs

| Input       | Type     | Description               |
| ----------- | -------- | ------------------------- |
| value       | `string` | Initial date (YYYY-MM-DD) |
| placeholder | `string` | Input placeholder text    |

### Output

| Output     | Type     | Description                                                                 |
| ---------- | -------- | --------------------------------------------------------------------------- |
| dateChange | `string` | Emitted with the selected date string (YYYY-MM-DD) or empty string on clear |

### Theme

The theme is imported globally in `styles.css`:

```css
@import './app/shared/flatpickr-theme.css';
```

It uses CSS variables from `theme.css` (`--color-border`, `--color-surface`, `--color-primary`, etc.) and responds to the `.dark` class for dark mode.

## Chart.js Configuration

**File:** `shared/chart-config.ts`

Registers the minimal Chart.js components needed for line charts (tree-shaken). Import this file as a side-effect before rendering any chart:

```typescript
import '../../../shared/chart-config';
```

Registers: `LineController`, `LineElement`, `PointElement`, `LinearScale`, `CategoryScale`, `Tooltip`, `Legend`, `Filler`.

### Chart Resize Fix

When using Chart.js with `responsive: true`, wrap the canvas in a fixed-height container with `position: relative` and set `maintainAspectRatio: false`:

```html
<div class="relative h-[300px] w-full">
  <canvas
    style="position: absolute; inset: 0; width: 100% !important; height: 100% !important;"
    baseChart
    [type]="'line'"
    [data]="chartData()"
    [options]="chartOptions"
  ></canvas>
</div>
```

This prevents the canvas from constraining its parent's width, allowing proper grow-back on window resize.

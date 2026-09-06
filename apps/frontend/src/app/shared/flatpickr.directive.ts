import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  type AfterViewInit,
} from '@angular/core';
import flatpickr from 'flatpickr';

@Directive({
  selector: '[appFlatpickr]',
})
export class FlatpickrDirective implements AfterViewInit {
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly dateChange = output<string>();

  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private instance: { destroy(): void } | null = null;

  ngAfterViewInit(): void {
    this.instance = flatpickr(this.elRef.nativeElement, {
      dateFormat: 'Y-m-d',
      defaultDate: this.value() || undefined,
      allowInput: true,
      disableMobile: true,
      onChange: (_dates, dateStr) => {
        this.dateChange.emit(dateStr);
      },
    });

    this.destroyRef.onDestroy(() => {
      this.instance?.destroy();
    });
  }
}

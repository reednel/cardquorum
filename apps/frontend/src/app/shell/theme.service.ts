import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly darkMode;

  constructor() {
    const stored = localStorage.getItem('theme');
    const prefersDark =
      stored === null
        ? this.doc.defaultView!.matchMedia('(prefers-color-scheme: dark)').matches
        : stored === 'dark';

    this.darkMode = signal(prefersDark);
    this.applyTheme(prefersDark);
  }

  toggle(): void {
    const next = !this.darkMode();
    this.darkMode.set(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    this.applyTheme(next);
  }

  private applyTheme(dark: boolean): void {
    this.doc.documentElement.classList.toggle('dark', dark);
  }
}

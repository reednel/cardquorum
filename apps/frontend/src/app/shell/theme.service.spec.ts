import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    // Mock matchMedia for jsdom (returns false = light by default)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  function setup(): ThemeService {
    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeService);
  }

  it('should default to light when no stored preference and no OS preference', () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    const service = setup();
    expect(service.darkMode()).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should restore dark mode from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('dark');
    const service = setup();
    expect(service.darkMode()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should restore light mode from localStorage', () => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    const service = setup();
    expect(service.darkMode()).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle should switch from light to dark', () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    const service = setup();
    service.toggle();
    expect(service.darkMode()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggle should switch from dark to light', () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('dark');
    const service = setup();
    service.toggle();
    expect(service.darkMode()).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeService } from '../shell/theme.service';
import { PlayerSeat } from './player-seat';

describe('PlayerSeat', () => {
  let fixture: ComponentFixture<PlayerSeat>;
  let el: HTMLElement;

  const mockThemeService = {
    darkMode: signal(false),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerSeat],
      providers: [{ provide: ThemeService, useValue: mockThemeService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerSeat);
    el = fixture.nativeElement;
  });

  it('applies border-color on the pill when hue is present', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 200);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    expect(pill).toBeTruthy();
    expect(pill.style.borderColor).not.toBe('');
  });

  it('does not apply border-color when hue is null', () => {
    fixture.componentRef.setInput('displayName', 'Bob');
    fixture.componentRef.setInput('hue', null);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    expect(pill).toBeTruthy();
    expect(pill.style.borderColor).toBe('');
  });

  it('produces different border colors for different hues', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 120);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    const color120 = pill.style.borderColor;
    expect(color120).not.toBe('');

    fixture.componentRef.setInput('hue', 240);
    fixture.detectChanges();

    const color240 = pill.style.borderColor;
    expect(color240).not.toBe('');
    expect(color240).not.toBe(color120);
  });
});

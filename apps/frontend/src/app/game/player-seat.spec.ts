import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerSeat } from './player-seat';

describe('PlayerSeat', () => {
  let fixture: ComponentFixture<PlayerSeat>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerSeat],
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
    expect(pill.style.borderColor).toContain('hsl(200');
  });

  it('does not apply border-color when hue is null', () => {
    fixture.componentRef.setInput('displayName', 'Bob');
    fixture.componentRef.setInput('hue', null);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    expect(pill).toBeTruthy();
    expect(pill.style.borderColor).toBe('');
  });

  it('uses the provided hue in the border color', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 120);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    expect(pill.style.borderColor).toContain('hsl(120');
  });

  it('uses a different hue value when hue changes', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 240);
    fixture.detectChanges();

    const pill = el.querySelector<HTMLElement>('.seat-pill')!;
    expect(pill.style.borderColor).toContain('hsl(240');
  });
});

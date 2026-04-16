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

  it('renders border-bottom when hue is present', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 200);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    expect(nameSpan).toBeTruthy();
    expect(nameSpan.style.borderBottom).toContain('2px solid');
  });

  it('renders no border-bottom when hue is null', () => {
    fixture.componentRef.setInput('displayName', 'Bob');
    fixture.componentRef.setInput('hue', null);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    expect(nameSpan).toBeTruthy();
    expect(nameSpan.style.borderBottom).toBe('');
  });

  it('uses the provided hue in the border color', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 120);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    const border = nameSpan.style.borderBottom;
    expect(border).toContain('2px solid');
    expect(border).toContain('hsl(120');
  });

  it('uses a different hue value when hue changes', () => {
    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 240);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    const border = nameSpan.style.borderBottom;
    expect(border).toContain('hsl(240');
  });
});

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

  afterEach(() => {
    document.documentElement.classList.remove('dark');
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

  it('uses dark theme lightness when dark class is present', () => {
    document.documentElement.classList.add('dark');

    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 120);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    const border = nameSpan.style.borderBottom;
    // hsl(120, 75%, 33%) → rgb(21, 147, 21) in jsdom
    expect(border).toContain('rgb(21, 147, 21)');
  });

  it('uses light theme lightness when dark class is absent', () => {
    document.documentElement.classList.remove('dark');

    fixture.componentRef.setInput('displayName', 'Alice');
    fixture.componentRef.setInput('hue', 120);
    fixture.detectChanges();

    const nameSpan = el.querySelector<HTMLElement>('.truncate')!;
    const border = nameSpan.style.borderBottom;
    // hsl(120, 75%, 66%) → rgb(103, 233, 103) in jsdom
    expect(border).toContain('rgb(103, 233, 103)');
  });
});

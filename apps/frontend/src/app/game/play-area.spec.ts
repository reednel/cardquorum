import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ColorAssignmentMap, TrickPlayView } from '@cardquorum/shared';
import { PlayArea } from './play-area';

describe('PlayArea', () => {
  let fixture: ComponentFixture<PlayArea>;
  let el: HTMLElement;

  const PLAYS: TrickPlayView[] = [
    { userID: 1, cardName: 'qc' },
    { userID: 2, cardName: 'ad' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayArea],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayArea);
    el = fixture.nativeElement;
  });

  it('renders box-shadow when colorMap has a hue for the player', () => {
    const colorMap: ColorAssignmentMap = { 1: 200, 2: 40 };
    fixture.componentRef.setInput('plays', PLAYS);
    fixture.componentRef.setInput('colorMap', colorMap);
    fixture.detectChanges();

    const cardDivs = el.querySelectorAll<HTMLElement>('[style*="box-shadow"]');
    expect(cardDivs.length).toBe(2);

    const firstShadow = cardDivs[0].style.boxShadow;
    expect(firstShadow).toContain('hsl');
    expect(firstShadow).toContain('200');
  });

  it('renders no box-shadow when colorMap is undefined', () => {
    fixture.componentRef.setInput('plays', PLAYS);
    // colorMap defaults to undefined
    fixture.detectChanges();

    const allDivs = el.querySelectorAll<HTMLElement>('.absolute');
    allDivs.forEach((div) => {
      expect(div.style.boxShadow).toBe('');
    });
  });

  it('renders no box-shadow when player has no hue in colorMap', () => {
    const colorMap: ColorAssignmentMap = { 999: 120 }; // no entry for userID 1 or 2
    fixture.componentRef.setInput('plays', PLAYS);
    fixture.componentRef.setInput('colorMap', colorMap);
    fixture.detectChanges();

    const allDivs = el.querySelectorAll<HTMLElement>('.absolute');
    allDivs.forEach((div) => {
      expect(div.style.boxShadow).toBe('');
    });
  });

  it('uses lightness 33 for dark theme', () => {
    document.documentElement.classList.add('dark');

    const colorMap: ColorAssignmentMap = { 1: 200 };
    fixture.componentRef.setInput('plays', [PLAYS[0]]);
    fixture.componentRef.setInput('colorMap', colorMap);
    fixture.detectChanges();

    const cardDiv = el.querySelector<HTMLElement>('[style*="box-shadow"]');
    expect(cardDiv).toBeTruthy();
    expect(cardDiv!.style.boxShadow).toContain('33%');

    document.documentElement.classList.remove('dark');
  });

  it('uses lightness 66 for light theme', () => {
    document.documentElement.classList.remove('dark');

    const colorMap: ColorAssignmentMap = { 1: 200 };
    fixture.componentRef.setInput('plays', [PLAYS[0]]);
    fixture.componentRef.setInput('colorMap', colorMap);
    fixture.detectChanges();

    const cardDiv = el.querySelector<HTMLElement>('[style*="box-shadow"]');
    expect(cardDiv).toBeTruthy();
    expect(cardDiv!.style.boxShadow).toContain('66%');
  });
});

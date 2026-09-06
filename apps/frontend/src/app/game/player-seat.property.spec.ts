import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import * as fc from 'fast-check';
import type { BadgeColor, BadgePosition, SeatBadge } from '@cardquorum/shared';
import { ThemeService } from '../shell/theme.service';
import { PlayerSeat } from './player-seat';

const BADGE_COLORS: BadgeColor[] = ['red', 'yellow', 'green', 'blue', 'purple', 'pink', 'dark'];
const BADGE_POSITIONS: BadgePosition[] = ['left', 'right'];

const arbBadge: fc.Arbitrary<SeatBadge> = fc.record({
  label: fc.stringMatching(/^[A-Z0-9]$/),
  color: fc.constantFrom(...BADGE_COLORS),
  position: fc.constantFrom(...BADGE_POSITIONS),
  description: fc.string({ minLength: 1, maxLength: 30 }),
});

describe('Badge rendering count fidelity', () => {
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

  it('renders exactly as many badge elements as badges in the input array', () => {
    fc.assert(
      fc.property(fc.array(arbBadge, { minLength: 0, maxLength: 5 }), (badges) => {
        fixture.componentRef.setInput('displayName', 'TestPlayer');
        fixture.componentRef.setInput('badges', badges);
        fixture.detectChanges();

        const renderedBadges = el.querySelectorAll('span[aria-label]');
        expect(renderedBadges.length).toBe(badges.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Badge position ordering', () => {
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

  it('left-positioned badges appear before the name pill and right-positioned badges appear after', () => {
    fc.assert(
      fc.property(
        fc
          .array(arbBadge, { minLength: 1, maxLength: 6 })
          .filter(
            (badges) =>
              badges.some((b) => b.position === 'left') &&
              badges.some((b) => b.position === 'right'),
          ),
        (badges) => {
          fixture.componentRef.setInput('displayName', 'TestPlayer');
          fixture.componentRef.setInput('badges', badges);
          fixture.detectChanges();

          const container = el.querySelector('.inline-flex.items-center.gap-1') as HTMLElement;
          expect(container).toBeTruthy();

          const children = Array.from(container.children);
          const groups = children.filter((child) => child.getAttribute('role') === 'group');
          const pill = children.find((child) => child.classList.contains('seat-pill'));

          // Both groups and the pill must be present
          expect(groups.length).toBe(2);
          expect(pill).toBeTruthy();

          const leftGroup = groups[0];
          const rightGroup = groups[1];

          // Left group appears before the pill in DOM order
          const leftGroupIndex = children.indexOf(leftGroup);
          const pillIndex = children.indexOf(pill!);
          const rightGroupIndex = children.indexOf(rightGroup);

          expect(leftGroupIndex).toBeLessThan(pillIndex);
          expect(rightGroupIndex).toBeGreaterThan(pillIndex);

          // All badges in the left group correspond to left-positioned input badges
          const leftBadgeEls = leftGroup.querySelectorAll('span[aria-label]');
          const leftBadges = badges.filter((b) => b.position === 'left');
          expect(leftBadgeEls.length).toBe(leftBadges.length);

          // All badges in the right group correspond to right-positioned input badges
          const rightBadgeEls = rightGroup.querySelectorAll('span[aria-label]');
          const rightBadges = badges.filter((b) => b.position === 'right');
          expect(rightBadgeEls.length).toBe(rightBadges.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

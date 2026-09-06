import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SegmentedToggle } from './segmented-toggle';

const TEST_OPTIONS = [
  { value: 'chat', label: 'Chat' },
  { value: 'game-log', label: 'Game Log' },
  { value: 'all', label: 'All' },
];

describe('SegmentedToggle', () => {
  let fixture: ComponentFixture<SegmentedToggle>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SegmentedToggle],
    }).compileComponents();

    fixture = TestBed.createComponent(SegmentedToggle);
    fixture.componentRef.setInput('options', TEST_OPTIONS);
    fixture.componentRef.setInput('value', 'chat');
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('renders three buttons with role="tab"', () => {
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
  });

  it('host element has role="tablist"', () => {
    expect(el.getAttribute('role')).toBe('tablist');
  });

  it('selected option has aria-selected="true", others have aria-selected="false"', () => {
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
  });

  it('selected option has tabindex="0", others have tabindex="-1"', () => {
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
    expect(tabs[2].getAttribute('tabindex')).toBe('-1');
  });

  it('all buttons have aria-controls pointing to panelId', () => {
    fixture.componentRef.setInput('panelId', 'my-panel');
    fixture.detectChanges();

    const tabs = el.querySelectorAll('[role="tab"]');
    tabs.forEach((tab) => {
      expect(tab.getAttribute('aria-controls')).toBe('my-panel');
    });
  });

  it('clicking an unselected option emits valueChange with the new value', () => {
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[1].click();

    expect(emitted).toEqual(['game-log']);
  });

  it('clicking the already-selected option does not emit valueChange', () => {
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0].click();

    expect(emitted).toEqual([]);
  });

  it('ArrowRight from last option wraps to first and emits valueChange', () => {
    fixture.componentRef.setInput('value', 'all');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    tabs[2].dispatchEvent(event);

    expect(emitted).toEqual(['chat']);
  });

  it('ArrowLeft from first option wraps to last and emits valueChange', () => {
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    tabs[0].dispatchEvent(event);

    expect(emitted).toEqual(['all']);
  });

  it('Enter key on focused option emits valueChange', () => {
    fixture.componentRef.setInput('value', 'chat');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    tabs[1].dispatchEvent(event);

    expect(emitted).toEqual(['game-log']);
  });

  it('Space key on focused option emits valueChange', () => {
    fixture.componentRef.setInput('value', 'chat');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v: string) => emitted.push(v));

    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    tabs[2].dispatchEvent(event);

    expect(emitted).toEqual(['all']);
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserProfile } from '@cardquorum/shared';
import { AccountPage } from './account-page';
import { UserService } from './user.service';

const PROFILE: UserProfile = {
  userId: 1,
  username: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  createdAt: '2026-01-15T10:30:00Z',
};

describe('AccountPage', () => {
  let fixture: ComponentFixture<AccountPage>;
  let el: HTMLElement;

  const profileSignal = signal<UserProfile | null>(null);
  const mockUserService = {
    profile: profileSignal.asReadonly(),
    loadProfile: jest.fn(),
    updateDisplayName: jest.fn(),
  };

  beforeEach(async () => {
    profileSignal.set(null);
    mockUserService.loadProfile.mockClear();
    mockUserService.updateDisplayName.mockClear();

    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideRouter([]), { provide: UserService, useValue: mockUserService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('calls loadProfile on init', () => {
    expect(mockUserService.loadProfile).toHaveBeenCalled();
  });

  it('shows loading state while profile is null', () => {
    expect(el.textContent).toContain('Loading');
  });

  it('displays profile fields when loaded', () => {
    profileSignal.set(PROFILE);
    fixture.detectChanges();

    expect(el.textContent).toContain('alice');
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('alice@example.com');
  });

  it('shows "Not set" when email is null', () => {
    profileSignal.set({ ...PROFILE, email: null });
    fixture.detectChanges();

    expect(el.textContent).toContain('Not set');
  });

  it('shows edit form when Edit button is clicked', () => {
    profileSignal.set(PROFILE);
    fixture.detectChanges();

    const editBtn = el.querySelector('[data-testid="edit-display-name-btn"]') as HTMLButtonElement;
    editBtn.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="display-name-input"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="save-display-name-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="cancel-edit-btn"]')).toBeTruthy();
  });

  it('cancel reverts to display mode', () => {
    profileSignal.set(PROFILE);
    fixture.detectChanges();

    (el.querySelector('[data-testid="edit-display-name-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    (el.querySelector('[data-testid="cancel-edit-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="display-name-input"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="edit-display-name-btn"]')).toBeTruthy();
  });

  it('has a link to friends page', () => {
    profileSignal.set(PROFILE);
    fixture.detectChanges();

    const link = el.querySelector('[data-testid="friends-link"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
  });
});

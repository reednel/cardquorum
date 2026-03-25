import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { UserProfile } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
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
    deleteAccount: jest.fn(),
  };

  const userSignal = signal<any>(null);
  const mockAuthService = { user: userSignal.asReadonly() };

  beforeEach(async () => {
    profileSignal.set(null);
    mockUserService.loadProfile.mockClear();
    mockUserService.updateDisplayName.mockClear();
    userSignal.set({ userId: 1, displayName: 'Alice', authMethod: 'basic' });

    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
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

  describe('delete account', () => {
    beforeEach(() => {
      profileSignal.set(PROFILE);
      fixture.detectChanges();
    });

    it('shows delete section with button', () => {
      const btn = el.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement;
      expect(btn).toBeTruthy();
    });

    it('shows password confirmation after clicking delete', () => {
      const btn = el.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="delete-password-input"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="confirm-delete-btn"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="cancel-delete-btn"]')).toBeTruthy();
    });

    it('cancel hides the confirmation', () => {
      (el.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      (el.querySelector('[data-testid="cancel-delete-btn"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="delete-password-input"]')).toBeFalsy();
    });
  });

  describe('delete account (oidc user)', () => {
    beforeEach(() => {
      userSignal.set({ userId: 1, displayName: 'Alice', authMethod: 'oidc' });
      profileSignal.set(PROFILE);
      fixture.detectChanges();
    });

    it('shows OIDC re-auth message instead of password prompt', () => {
      const deleteBtn = el.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement;
      deleteBtn.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="delete-password-input"]')).toBeFalsy();
      expect(el.textContent).toContain('identity provider');
      expect(el.querySelector('[data-testid="confirm-delete-btn"]')?.textContent).toContain(
        'Re-authenticate',
      );
    });
  });
});

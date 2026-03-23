import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { UserDropdown } from './user-dropdown';

describe('UserDropdown', () => {
  let fixture: ComponentFixture<UserDropdown>;
  let el: HTMLElement;
  let router: Router;
  let mockAuthService: { user: ReturnType<typeof signal>; logout: jest.Mock };

  beforeEach(async () => {
    mockAuthService = {
      user: signal({ userId: 1, displayName: 'Alice' }),
      logout: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserDropdown],
      providers: [
        provideRouter([{ path: 'account', component: UserDropdown }]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDropdown);
    router = TestBed.inject(Router);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows display name on trigger button', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    expect(btn.textContent).toContain('Alice');
  });

  it('menu is hidden by default', () => {
    expect(el.querySelector('[data-testid="user-menu"]')).toBeFalsy();
  });

  it('opens menu on trigger click', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-menu"]')).toBeTruthy();
  });

  it('closes menu on Escape key', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-menu"]')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-menu"]')).toBeFalsy();
  });

  it('navigates to /account on Account click', () => {
    jest.spyOn(router, 'navigate');
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const accountLink = el.querySelector('[data-testid="menu-account"]') as HTMLElement;
    accountLink.click();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/account']);
  });

  it('calls logout on Logout click', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const logoutBtn = el.querySelector('[data-testid="menu-logout"]') as HTMLButtonElement;
    logoutBtn.click();
    fixture.detectChanges();

    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('closes menu after clicking a menu item', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const logoutBtn = el.querySelector('[data-testid="menu-logout"]') as HTMLButtonElement;
    logoutBtn.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="user-menu"]')).toBeFalsy();
  });

  it('closes menu on click outside', () => {
    const btn = el.querySelector('[data-testid="user-menu-trigger"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-menu"]')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-menu"]')).toBeFalsy();
  });
});

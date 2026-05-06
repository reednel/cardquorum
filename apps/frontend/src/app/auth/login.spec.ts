import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Login } from './login';

describe('Login', () => {
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    sessionStorage.clear();
    httpTesting.verify();
  });

  it('should render login form', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input#username')).toBeTruthy();
    expect(el.querySelector('input#password')).toBeTruthy();
    expect(el.querySelector('button[type="submit"]')).toBeTruthy();
  });

  it('should call login and navigate on success', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ username: 'alice', password: 'pass' });
    fixture.componentInstance['onSubmit']();

    const req = httpTesting.expectOne('/api/auth/login');
    req.flush({ userId: 1, displayName: 'Alice' });

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('should navigate to stored return URL after login', () => {
    sessionStorage.setItem('cq_return_url', '/rooms/42');
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const navigateByUrlSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ username: 'alice', password: 'pass' });
    fixture.componentInstance['onSubmit']();

    httpTesting.expectOne('/api/auth/login').flush({ userId: 1, displayName: 'Alice' });

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/rooms/42');
    expect(sessionStorage.getItem('cq_return_url')).toBeNull();
  });

  it('should show error message on 401', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    fixture.componentInstance['form'].setValue({ username: 'alice', password: 'wrong' });
    fixture.componentInstance['onSubmit']();

    httpTesting
      .expectOne('/api/auth/login')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.componentInstance['errorMessage']()).toBe('Invalid username or password');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Invalid username or password',
    );
  });

  it('should show SSO button when oidc strategy is enabled', () => {
    const authService = TestBed.inject(AuthService);
    authService.loadStrategies();
    httpTesting.expectOne('/api/auth/strategies').flush({ strategies: ['basic', 'oidc'] });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="sso-button"]')).toBeTruthy();
  });

  it('should not show SSO button when only basic strategy is enabled', () => {
    const authService = TestBed.inject(AuthService);
    authService.loadStrategies();
    httpTesting.expectOne('/api/auth/strategies').flush({ strategies: ['basic'] });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="sso-button"]')).toBeNull();
  });
});

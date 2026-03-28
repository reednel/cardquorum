import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Register } from './register';

describe('Register', () => {
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(Register);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render register form with three fields', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input#username')).toBeTruthy();
    expect(el.querySelector('input#password')).toBeTruthy();
    expect(el.querySelector('input#confirmPassword')).toBeTruthy();
  });

  it('should call register and navigate on success', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({
      username: 'bobuser',
      password: 'password123',
      confirmPassword: 'password123',
    });
    fixture.componentInstance['onSubmit']();

    const req = httpTesting.expectOne('/api/auth/register');
    req.flush({ userId: 2, username: 'bobuser', displayName: null });

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('should show error message on 409', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();

    fixture.componentInstance['form'].setValue({
      username: 'takenuser',
      password: 'password123',
      confirmPassword: 'password123',
    });
    fixture.componentInstance['onSubmit']();

    httpTesting
      .expectOne('/api/auth/register')
      .flush('Conflict', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(fixture.componentInstance['errorMessage']()).toBe('Username already taken');
  });
});

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
    expect(el.querySelector('input#displayName')).toBeTruthy();
    expect(el.querySelector('input#password')).toBeTruthy();
  });

  it('should call register and navigate on success', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({
      username: 'bob',
      displayName: 'Bob',
      password: 'pass',
    });
    fixture.componentInstance['onSubmit']();

    const req = httpTesting.expectOne('/api/auth/register');
    req.flush({ userId: 2, displayName: 'Bob' });

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('should show error message on 409', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();

    fixture.componentInstance['form'].setValue({
      username: 'taken',
      displayName: 'Taken',
      password: 'pass',
    });
    fixture.componentInstance['onSubmit']();

    httpTesting
      .expectOne('/api/auth/register')
      .flush('Conflict', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(fixture.componentInstance['errorMessage']()).toBe('Username already taken');
  });
});

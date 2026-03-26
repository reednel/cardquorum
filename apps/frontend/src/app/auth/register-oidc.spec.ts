import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RegisterOidc } from './register-oidc';

describe('RegisterOidc', () => {
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterOidc],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(RegisterOidc);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render username form without password field', () => {
    const fixture = TestBed.createComponent(RegisterOidc);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input#username')).toBeTruthy();
    expect(el.querySelector('input#password')).toBeFalsy();
  });

  it('should call oidcRegister and navigate on success', () => {
    const fixture = TestBed.createComponent(RegisterOidc);
    fixture.detectChanges();
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ username: 'newuser' });
    fixture.componentInstance['onSubmit']();

    const req = httpTesting.expectOne('/api/auth/oidc/register');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ username: 'newuser' });
    req.flush(null);

    // credentials refresh triggered by oidcRegister
    httpTesting.expectOne('/api/auth/credentials').flush({ methods: ['oidc'] });

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('should show error message on 409', () => {
    const fixture = TestBed.createComponent(RegisterOidc);
    fixture.detectChanges();

    fixture.componentInstance['form'].setValue({ username: 'takenuser' });
    fixture.componentInstance['onSubmit']();

    httpTesting
      .expectOne('/api/auth/oidc/register')
      .flush('Conflict', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(fixture.componentInstance['errorMessage']()).toBe('Username already taken');
  });

  it('should not submit when form is invalid', () => {
    const fixture = TestBed.createComponent(RegisterOidc);
    fixture.detectChanges();

    fixture.componentInstance['form'].setValue({ username: 'ab' }); // too short
    fixture.componentInstance['onSubmit']();

    httpTesting.expectNone('/api/auth/oidc/register');
  });
});

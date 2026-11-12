import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ShortLink } from './link.service';

describe('AppComponent', () => {
  const apiUrl = 'http://localhost:3000/api/links';
  let fixture: ComponentFixture<AppComponent>;
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTestingController.expectOne({ method: 'GET', url: apiUrl }).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpTestingController.verify());

  it('renders the Snip form and empty state', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Make room for');
    expect(element.querySelector('#url')).toBeTruthy();
    expect(element.textContent).toContain('No links yet.');
  });

  it('rejects non-http URLs before sending a request', () => {
    const component = fixture.componentInstance;
    component.urlControl.setValue('ftp://example.com/file');
    component.urlControl.markAsTouched();
    fixture.detectChanges();

    expect(component.form.invalid).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('#url-error')?.textContent)
      .toContain('valid http or https URL');
    httpTestingController.expectNone((request) => request.method === 'POST');
  });

  it('creates a link, refreshes the list, and renders the result', () => {
    const link: ShortLink = {
      code: 'a1B2c3',
      url: 'https://example.com/a-long-page',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const component = fixture.componentInstance;
    component.urlControl.setValue(link.url);
    component.submit();

    httpTestingController.expectOne({ method: 'POST', url: apiUrl }).flush(link);
    httpTestingController.expectOne({ method: 'GET', url: apiUrl }).flush([link]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.notice-success a')?.getAttribute('href')).toBe(link.shortUrl);
    expect(element.querySelector('tbody a')?.textContent).toContain(link.shortUrl);
    expect(element.querySelector('tbody')?.textContent).toContain(link.url);
    expect(element.querySelector('.hit-count')?.textContent).toBe('0');
  });

  it('shows a server error beside the form on failure', () => {
    const component = fixture.componentInstance;
    component.urlControl.setValue('https://example.com');
    component.submit();
    httpTestingController.expectOne({ method: 'POST', url: apiUrl }).flush(
      { error: 'That URL could not be shortened.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.notice-error')?.textContent)
      .toContain('That URL could not be shortened.');
    expect(component.isSubmitting()).toBeFalse();
  });
});

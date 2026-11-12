import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LinkService, ShortLink } from './link.service';

function httpUrlValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value).trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly linkService = inject(LinkService);

  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator],
    }),
  });
  readonly links = signal<ShortLink[]>([]);
  readonly createdLink = signal<ShortLink | null>(null);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal('');

  ngOnInit(): void {
    this.refreshLinks();
  }

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.createdLink.set(null);

    this.linkService.createLink(this.form.controls.url.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.isSubmitting.set(false);
        this.refreshLinks();
      },
      error: (error: unknown) => {
        this.submitError.set(this.errorMessage(error, 'Could not shorten this URL. Please try again.'));
        this.isSubmitting.set(false);
      },
    });
  }

  refreshLinks(): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.linkService.getLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.errorMessage(error, 'Could not load links. Please try again.'));
        this.isLoading.set(false);
      },
    });
  }

  get urlControl(): FormControl<string> {
    return this.form.controls.url;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = (error.error as { error?: unknown } | null)?.error;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    return fallback;
  }
}

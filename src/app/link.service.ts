import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ShortLink {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/links';

  getLinks(): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(this.apiUrl);
  }

  createLink(url: string): Observable<ShortLink> {
    return this.http.post<ShortLink>(this.apiUrl, { url });
  }
}

import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ApiService } from './core/api.service';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(ApiService);

  /** 'ok' si le backend répond, 'injoignable' sinon. */
  protected readonly backendStatus = toSignal(
    this.api.getHealth().pipe(
      map((health) => health.status),
      catchError(() => of('injoignable')),
    ),
    { initialValue: 'vérification…' },
  );
}

import { Component, inject } from '@angular/core';
import { CollectionService } from '../core/collection.service';
import { I18nService } from '../core/i18n/i18n.service';

/** Header button that starts a collection. The status bar shows how it went. */
@Component({
  selector: 'app-collect-button',
  styleUrl: './collect-button.scss',
  templateUrl: './collect-button.html',
})
export class CollectButton {
  protected readonly collection = inject(CollectionService);
  protected readonly i18n = inject(I18nService);
}

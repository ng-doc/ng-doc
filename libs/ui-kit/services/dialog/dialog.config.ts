import { OverlayConfig } from '@angular/cdk/overlay';

export type NgDocDialogConfig = Omit<OverlayConfig, 'positionStrategy' | 'scrollStrategy'>;

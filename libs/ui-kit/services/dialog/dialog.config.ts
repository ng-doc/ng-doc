import { OverlayConfig } from '@angular/cdk/overlay';

export interface NgDocDialogConfig<D = unknown> extends OverlayConfig {
  data?: D;
}

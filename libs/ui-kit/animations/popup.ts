import { animate, AnimationTriggerMetadata, style, transition, trigger } from '@angular/animations';

export const popupAnimation: AnimationTriggerMetadata = trigger('popupAnimation', [
  transition(':enter', [
    style({ transform: 'scale(0.9)' }),
    animate('220ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ transform: 'scale(1)' })),
  ]),
]);

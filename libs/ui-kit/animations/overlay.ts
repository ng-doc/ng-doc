import { ElementAnimation } from '@ng-doc/ui-kit/types';

export const dropdownOpenAnimation: ElementAnimation = [
  [
    { transform: 'scale(0.9)', opacity: 0 },
    { transform: 'scale(1)', opacity: 1 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

export const dropdownCloseAnimation: ElementAnimation = [
  [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(0.9)', opacity: 0 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

export const tooltipOpenAnimation: ElementAnimation = [
  [
    { transform: 'scale(0.8)', opacity: 0 },
    { transform: 'scale(1)', opacity: 1 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

export const tooltipCloseAnimation: ElementAnimation = [
  [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(0.8)', opacity: 0 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

export const notificationOpenAnimation: ElementAnimation = [
  [
    { transform: 'scale(0.7)', opacity: 0 },
    { transform: 'scale(1)', opacity: 1 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

export const notificationCloseAnimation: ElementAnimation = [
  [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(0.7)', opacity: 0 },
  ],
  {
    duration: 120,
    easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
];

import { merge, Observable } from 'rxjs';

export interface MainTrigger {
  type: 'main';
  trigger: Observable<unknown>;
}

export interface SecondaryTrigger {
  type: 'secondary';
  trigger: Observable<unknown>;
}

export type Trigger = MainTrigger | SecondaryTrigger;

/**
 *
 * @param trigger
 */
export function isMainTrigger(trigger: Trigger): trigger is MainTrigger {
  return trigger.type === 'main';
}

/**
 *
 * @param trigger
 */
export function isSecondaryTrigger(trigger: Trigger): trigger is SecondaryTrigger {
  return trigger.type === 'secondary';
}

/**
 *
 * @param {...any} triggers
 */
export function createMainTrigger(...triggers: Array<Observable<unknown>>): MainTrigger {
  return { type: 'main', trigger: merge(...triggers) };
}

/**
 *
 * @param {...any} triggers
 */
export function createSecondaryTrigger(...triggers: Array<Observable<unknown>>): SecondaryTrigger {
  return { type: 'secondary', trigger: merge(...triggers) };
}

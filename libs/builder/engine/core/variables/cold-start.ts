let IS_COLD_START = true;

/**
 *
 */
export function setColdStartFalse(): void {
  IS_COLD_START = false;
}

/**
 *
 */
export function isColdStart(): boolean {
  return IS_COLD_START;
}

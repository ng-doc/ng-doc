/**
 *
 */
export function uid() {
  return Math.random().toString(36).slice(-8);
}

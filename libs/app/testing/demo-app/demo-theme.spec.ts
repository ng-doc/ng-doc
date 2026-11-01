import { ɵdemoThemeFromFragment, ɵwithDemoTheme } from '@ng-doc/app/demo-app';
import { describe, expect, it } from 'vitest';

describe('the theme of a demo page in its URL fragment', () => {
  it('is read from the ~theme parameter, with or without #', () => {
    expect(ɵdemoThemeFromFragment('#~theme=dark')).toBe('dark');
    expect(ɵdemoThemeFromFragment('~inputs=a&a=1&~theme=my%20brand')).toBe('my brand');
    expect(ɵdemoThemeFromFragment('~inputs=a&a=1')).toBeUndefined();
    expect(ɵdemoThemeFromFragment('~theme=')).toBeUndefined();
    expect(ɵdemoThemeFromFragment('~theme=%E0%A4%A')).toBeUndefined();
    expect(ɵdemoThemeFromFragment('')).toBeUndefined();
  });

  it('is written after the other parameters, and replaces or removes the one there', () => {
    expect(ɵwithDemoTheme(undefined, 'dark')).toBe('~theme=dark');
    expect(ɵwithDemoTheme('~inputs=a&a=1', 'my brand')).toBe('~inputs=a&a=1&~theme=my%20brand');
    expect(ɵwithDemoTheme('~inputs=a&~theme=dark', 'light')).toBe('~inputs=a&~theme=light');
    expect(ɵwithDemoTheme('~inputs=a&~theme=dark', undefined)).toBe('~inputs=a');
    expect(ɵwithDemoTheme(undefined, undefined)).toBeUndefined();
  });
});

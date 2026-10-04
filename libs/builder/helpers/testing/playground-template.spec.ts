import { buildPlaygroundDemoPipeTemplate, buildPlaygroundDemoTemplate } from '@ng-doc/core';
import { describe, expect, it } from 'vitest';

import { getPlaygroundTemplateInputs } from '../playground/get-playground-template-inputs';

describe('generated playground templates', () => {
  const inputs = getPlaygroundTemplateInputs({
    label: { type: 'string', inputName: 'label' },
    renamed: { type: 'number', inputName: 'amount' },
  });

  it('bind the target inputs to the properties signal input', () => {
    expect(inputs).toEqual({ label: "properties()['label']", amount: "properties()['renamed']" });
    expect(
      buildPlaygroundDemoTemplate(
        '<ng-doc-selector></ng-doc-selector>',
        'ng-doc-tag',
        {},
        inputs,
        false,
      ),
    ).toBe(
      `<ng-doc-tag [label]="properties()['label']" [amount]="properties()['renamed']"></ng-doc-tag>`,
    );
    expect(buildPlaygroundDemoPipeTemplate("{{ 'a' | pipe }}", 'pipe', {}, inputs, false)).toBe(
      `{{ 'a' | pipe:properties()['label']:properties()['renamed'] }}`,
    );
  });

  it('show a content slot with a built-in @if over the content signal input', () => {
    const template = buildPlaygroundDemoTemplate(
      '<ng-doc-selector>{{ content.icon }}Label</ng-doc-selector>',
      'ng-doc-tag',
      { icon: '<ng-doc-icon></ng-doc-icon>' },
      {},
      false,
    );

    expect(template).toContain("@if (content()['icon']) {");
    expect(template).toContain('<ng-doc-icon></ng-doc-icon>');
    expect(template).not.toContain('ngIf');
    // The code shown to readers keeps the enabled slot's markup only.
    expect(
      buildPlaygroundDemoTemplate(
        '<ng-doc-selector>{{ content.icon }}Label</ng-doc-selector>',
        'ng-doc-tag',
        { icon: '<ng-doc-icon></ng-doc-icon>' },
        {},
      ),
    ).not.toContain('@if');
  });
});

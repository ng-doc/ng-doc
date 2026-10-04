import { Injector, Renderer2 } from '@angular/core';
import { NgDocTabsComponent } from '@ng-doc/app/components/tabs';
import { NgDocPageProcessor, NgDocTab } from '@ng-doc/app/interfaces';

/**
 * Turns the `<ng-doc-tab group="…" name="…">` elements of a page into tabs: every tab of a group
 * becomes one `NgDocTabsComponent`, where the first tab of the group was. Code groups are made of
 * them, and Markdown can wrap any content in them.
 */
export const tabsProcessor: NgDocPageProcessor<NgDocTabsComponent> = {
  component: NgDocTabsComponent,
  selector: 'ng-doc-tab',
  nodeToReplace: (element: Element, injector: Injector) => {
    const renderer: Renderer2 = injector.get(Renderer2);
    const anchor: Element = renderer.createElement('div');

    return element.parentNode?.insertBefore(anchor, element) ?? element;
  },
  extractOptions: (element: Element, root: Element) => {
    const group: string = element.getAttribute('group') ?? '';
    const tabs: Element[] = Array.from(root.querySelectorAll('ng-doc-tab')).filter(
      (tab: Element) => (tab.getAttribute('group') ?? '') === group,
    );

    if (!tabs.includes(element)) {
      tabs.unshift(element);
    }

    // The tabs stay on the page until the component first renders (`NgDocTabsComponent`), so
    // the processors after this one, the page's own included, still reach their content. The
    // page processor skips elements that have left the page, so the other tabs of the group are
    // swapped for copies that hold their content: otherwise each would get tabs of its own.
    const contents: Element[] = tabs.map((tab: Element) => {
      if (tab === element || !tab.parentNode) {
        return tab;
      }

      const copy: Element = tab.cloneNode(false) as Element;

      while (tab.firstChild) {
        copy.appendChild(tab.firstChild);
      }
      tab.parentNode.replaceChild(copy, tab);

      return copy;
    });

    return {
      inputs: {
        tabs: tabs.map((tab: Element, index: number) => ({
          title: tab.getAttribute('name') ?? '',
          content: contents[index],
          icon: tab.getAttribute('icon') || undefined,
          active: tab.hasAttribute('active'),
        })) satisfies NgDocTab[],
      },
    };
  },
};

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDocImageViewerComponent } from '@ng-doc/app/components/image-viewer';
import { NgDocMermaidViewerComponent } from '@ng-doc/app/components/mermaid-viewer';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_MERMAID } from '@ng-doc/app/tokens';
import { Subject } from 'rxjs';
import {
  type Mock,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; the overlay awaits `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

@Component({
  selector: 'ng-doc-mermaid-host',
  template: `<ng-doc-mermaid-viewer [graph]="graph()"></ng-doc-mermaid-viewer>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocMermaidViewerComponent],
})
class MermaidHostComponent {
  readonly graph = signal<string>('graph TD; A-->B');
}

@Component({
  selector: 'ng-doc-image-host',
  template: `<ng-doc-image-viewer src="/a.png" alt="A diagram"
    ><img src="/a.png" alt="A diagram"
  /></ng-doc-image-viewer>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocImageViewerComponent],
})
class ImageHostComponent {}

@Component({
  selector: 'ng-doc-linked-image-host',
  template: `
    <a href="#target"><ng-doc-image-viewer src="/b.png" alt="Linked"></ng-doc-image-viewer></a>
    <ng-doc-image-viewer src="/c.png" alt=""></ng-doc-image-viewer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocImageViewerComponent],
})
class LinkedImageHostComponent {}

/**
 * Resolves after pending promises and a render.
 * @param fixture
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

describeChangeDetection('NgDocMermaidViewerComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<MermaidHostComponent>;
  let themeChanges: Subject<void>;
  let render: Mock;
  let theme: { currentTheme: string | null; themeChanges: () => Subject<void> };
  let siteTheme: string | undefined;

  beforeEach(async () => {
    themeChanges = new Subject<void>();
    theme = { currentTheme: null, themeChanges: () => themeChanges };
    siteTheme = undefined;
    render = vi.fn(async (_id: string, graph: string) => {
      if (graph === 'broken') {
        throw new Error('Parse error');
      }

      return { svg: `<svg data-graph="${graph}"></svg>` };
    });
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        {
          provide: NG_DOC_MERMAID,
          useValue: { render, mermaidAPI: { getSiteConfig: () => ({ theme: siteTheme }) } },
        },
        { provide: NgDocThemeService, useValue: theme },
      ],
    });
    fixture = TestBed.createComponent(MermaidHostComponent);
    await settle(fixture);
  });

  const svg = (): string | null | undefined =>
    fixture.nativeElement
      .querySelector('.ng-doc-mermaid-container svg')
      ?.getAttribute('data-graph');

  it('renders the graph, then again when it changes and when the theme changes', async () => {
    expect(svg()).toBe('graph TD; A-->B');

    fixture.componentInstance.graph.set('graph LR; A-->C');
    await settle(fixture);

    expect(svg()).toBe('graph LR; A-->C');

    const calls: number = render.mock.calls.length;

    themeChanges.next();
    await settle(fixture);

    expect(render.mock.calls.length).toBe(calls + 1);
    expect(svg()).toBe('graph LR; A-->C');
  });

  it('renders with the Mermaid dark theme while the page is dark, and back when it is light', async () => {
    const rendered = (): string => render.mock.calls[render.mock.calls.length - 1][1];

    expect(rendered()).toBe('graph TD; A-->B');

    theme.currentTheme = 'dark';
    themeChanges.next();
    await settle(fixture);

    expect(rendered()).toBe('%%{init: {"theme": "dark"}}%%\ngraph TD; A-->B');

    theme.currentTheme = null;
    themeChanges.next();
    await settle(fixture);

    expect(rendered()).toBe('graph TD; A-->B');
  });

  it('keeps a theme that the graph or provideMermaid chooses', async () => {
    const rendered = (): string => render.mock.calls[render.mock.calls.length - 1][1];

    theme.currentTheme = 'dark';
    fixture.componentInstance.graph.set('%%{init: {"theme": "forest"}}%%\ngraph TD; A-->B');
    await settle(fixture);

    expect(rendered()).toBe('%%{init: {"theme": "forest"}}%%\ngraph TD; A-->B');

    siteTheme = 'neutral';
    fixture.componentInstance.graph.set('graph LR; A-->C');
    await settle(fixture);

    expect(rendered()).toBe('graph LR; A-->C');
  });

  it('shows the latest graph when renders overlap', async () => {
    const pending: Array<(value: { svg: string }) => void> = [];

    render.mockImplementation(
      (_id: string, graph: string) =>
        new Promise((resolve) =>
          pending.push(() => resolve({ svg: `<svg data-graph="${graph}"></svg>` })),
        ),
    );

    fixture.componentInstance.graph.set('first');
    await settle(fixture);
    fixture.componentInstance.graph.set('second');
    await settle(fixture);

    // The second render finishes first, then the first one: the first result is dropped.
    pending[1]({ svg: '' });
    await settle(fixture);
    pending[0]({ svg: '' });
    await settle(fixture);

    expect(svg()).toBe('second');
  });

  it('shows a render error', async () => {
    fixture.componentInstance.graph.set('broken');
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.ng-doc-mermaid-error')?.textContent).toContain(
      'Parse error',
    );
  });

  it('stops following the theme once destroyed', async () => {
    fixture.destroy();

    const calls: number = render.mock.calls.length;

    themeChanges.next();
    await new Promise((resolve) => setTimeout(resolve));

    expect(render.mock.calls.length).toBe(calls);
  });
});

describeChangeDetection('NgDocImageViewerComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<ImageHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(ImageHostComponent);
    await fixture.whenStable();
  });

  const viewer = (): HTMLElement => fixture.nativeElement.querySelector('ng-doc-image-viewer');

  it('is a focusable button named after the image', () => {
    expect(viewer().getAttribute('role')).toBe('button');
    expect(viewer().getAttribute('tabindex')).toBe('0');
    expect(viewer().getAttribute('aria-label')).toBe('Open image: A diagram');
    expect(viewer().getAttribute('data-opened')).toBe('false');
  });

  it('opens the scaled image with Enter', async () => {
    viewer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(fixture);

    expect(viewer().getAttribute('data-opened')).toBe('true');
    expect(document.querySelector('.ng-doc-scaled-image')?.getAttribute('alt')).toBe('A diagram');

    (document.querySelector('.ng-doc-image-container') as HTMLElement).click();
    await settle(fixture);

    expect(viewer().getAttribute('data-opened')).toBe('false');
    // Closing returns the focus to the image, where the reader opened it.
    expect(document.activeElement).toBe(viewer());
  });

  it('leaves images in links and decorative images alone', async () => {
    const linked: ComponentFixture<LinkedImageHostComponent> =
      TestBed.createComponent(LinkedImageHostComponent);

    await linked.whenStable();

    const viewers: HTMLElement[] = Array.from(
      linked.nativeElement.querySelectorAll('ng-doc-image-viewer'),
    );

    for (const item of viewers) {
      expect(item.hasAttribute('role')).toBe(false);
      expect(item.hasAttribute('tabindex')).toBe(false);

      item.click();
      await settle(linked);

      expect(item.getAttribute('data-opened')).toBe('false');
    }

    expect(viewers.length).toBe(2);
    expect(document.querySelector('.ng-doc-scaled-image')).toBeNull();
  });

  describe('zoom', () => {
    let animate: Mock<(frames: Keyframe[]) => { finished: Promise<void> }>;
    let jsdomAnimate: PropertyDescriptor | undefined;
    let reduceMotion: boolean;

    /**
     * Lays out the page: a 1000 × 800 viewport and the thumbnail at (100, 200), 200 × 100.
     * @param natural - The natural size of the image, or `[0, 0]` when it has none.
     */
    function layout(natural: [number, number]): HTMLImageElement {
      const thumbnail: HTMLImageElement = viewer().querySelector('img')!;

      Object.defineProperties(thumbnail, {
        naturalWidth: { configurable: true, value: natural[0] },
        naturalHeight: { configurable: true, value: natural[1] },
        decode: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
        getBoundingClientRect: {
          configurable: true,
          value: () => ({ left: 100, top: 200, width: 200, height: 100 }) as DOMRect,
        },
      });

      return thumbnail;
    }

    /** The size of the opened image, as the overlay pane was given it. */
    function paneSize(): string[] {
      const pane: HTMLElement = document.querySelector('.ng-doc-image-container')!;

      return [pane.style.width, pane.style.height];
    }

    beforeEach(() => {
      reduceMotion = false;
      animate = vi.fn(() => ({ finished: Promise.resolve() }));
      jsdomAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
      Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
      vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
          matches: query.includes('prefers-reduced-motion') && reduceMotion,
        }),
      });
    });

    afterEach(async () => {
      (document.querySelector('.ng-doc-image-container') as HTMLElement | null)?.click();
      await settle(fixture);
      vi.restoreAllMocks();
      Object.defineProperty(Element.prototype, 'animate', jsdomAnimate!);
      delete (window as Partial<Window>).matchMedia;
    });

    it('opens a small image at its natural size, not scaled up', async () => {
      const thumbnail: HTMLImageElement = layout([400, 200]);

      viewer().click();
      await settle(fixture);

      expect(thumbnail.decode).toHaveBeenCalled();
      expect(paneSize()).toEqual(['400px', '200px']);
    });

    it('scales a large image down to the viewport with a margin', async () => {
      layout([4000, 2000]);

      viewer().click();
      await settle(fixture);

      // 1000 - 2 × 48 = 904 pixels wide at most, with the image's proportions.
      expect(paneSize()).toEqual(['904px', '452px']);
    });

    it('fills the viewport with the thumbnail proportions when the image has no natural size', async () => {
      layout([0, 0]);

      viewer().click();
      await settle(fixture);

      expect(paneSize()).toEqual(['904px', '452px']);
    });

    it('grows from the thumbnail straight to the computed size', async () => {
      layout([400, 200]);

      viewer().click();
      await settle(fixture);

      const [keyframes] = animate.mock.calls.find(([frames]: [Keyframe[]]) => frames?.length)!;

      // The image is centred at (300, 300); the thumbnail is at (100, 200) and half its size.
      expect(keyframes).toEqual([
        { transformOrigin: '0 0', transform: 'translate(-200px, -100px) scale(0.5)' },
        { transformOrigin: '0 0', transform: 'none' },
      ]);
    });

    it('starts from the thumbnail without distorting an image of other proportions', async () => {
      layout([300, 300]);

      viewer().click();
      await settle(fixture);

      const [keyframes] = animate.mock.calls.find(([frames]: [Keyframe[]]) => frames?.length)!;

      // The square image is centred at (350, 250). It starts a third of its size, centred in the
      // 200 × 100 thumbnail: a 100 × 100 square at (150, 200).
      expect(keyframes[0]).toEqual({
        transformOrigin: '0 0',
        transform: `translate(-200px, -50px) scale(${1 / 3})`,
      });
    });

    it('fits the opened image again when the window resizes', async () => {
      layout([4000, 2000]);

      viewer().click();
      await settle(fixture);
      expect(paneSize()).toEqual(['904px', '452px']);

      // A phone turned upright: 500 pixels wide, with the 16-pixel margin.
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(500);
      window.dispatchEvent(new Event('resize'));
      await settle(fixture);

      expect(paneSize()).toEqual(['468px', '234px']);
      expect((document.querySelector('.cdk-overlay-pane') as HTMLElement).style.width).toBe(
        '468px',
      );
    });

    describe('while the image decodes', () => {
      let decodes: Array<() => void>;

      beforeEach(() => {
        decodes = [];
        const thumbnail: HTMLImageElement = layout([400, 200]);

        Object.defineProperty(thumbnail, 'decode', {
          configurable: true,
          value: () => new Promise<void>((resolve) => decodes.push(resolve)),
        });
      });

      const opened = (): number => document.querySelectorAll('.ng-doc-image-container').length;

      it('opens only the latest request', async () => {
        viewer().click();
        viewer().click();
        decodes[1]();
        await settle(fixture);
        decodes[0]();
        await settle(fixture);

        expect(opened()).toBe(1);
        expect(animate.mock.calls.filter(([frames]: [Keyframe[]]) => frames?.length)).toHaveLength(
          1,
        );
      });

      it('does not open after Escape', async () => {
        viewer().click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        decodes[0]();
        await settle(fixture);

        expect(opened()).toBe(0);
        expect(viewer().getAttribute('data-opened')).toBe('false');
      });

      it('does not open after the page is left', async () => {
        viewer().click();
        fixture.destroy();
        decodes[0]();
        await settle(fixture);

        expect(opened()).toBe(0);
      });
    });

    it('opens without animation when the reader prefers reduced motion', async () => {
      reduceMotion = true;
      layout([400, 200]);

      viewer().click();
      await settle(fixture);

      expect(paneSize()).toEqual(['400px', '200px']);
      expect(animate.mock.calls.every(([frames]: [Keyframe[]]) => !frames?.length)).toBe(true);
    });
  });
});

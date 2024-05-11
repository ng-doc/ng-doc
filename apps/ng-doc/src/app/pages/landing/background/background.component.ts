import { NgFor, NgIf } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { NgDocTheme } from '@ng-doc/app';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { ngDocZoneDetach } from '@ng-doc/ui-kit';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromEvent } from 'rxjs';
import { debounceTime, startWith } from 'rxjs/operators';

import { GlowParticle } from './glow-particle';

const LIGHT_PALETTE = [
  { r: 201, g: 70, b: 208 }, // pink
  { r: 45, g: 74, b: 227 }, // blue
  { r: 255, g: 255, b: 255 }, // white
];

const DARK_PALETTE = [
  { r: 201, g: 70, b: 208 }, // pink
  { r: 45, g: 74, b: 227 }, // blue
  { r: 0, g: 0, b: 0 }, // black
];

@Component({
  selector: 'ng-doc-background',
  templateUrl: './background.component.html',
  styleUrls: ['./background.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [NgIf, NgFor],
})
@UntilDestroy()
export class BackgroundComponent implements OnDestroy {
  @Input()
  minRadius: number = 400;

  @Input()
  maxRadius: number = 1000;

  @Input()
  totalParticles: number = 20;

  @Input()
  showControls: boolean = false;

  @ViewChild('canvas', { static: true })
  canvas!: ElementRef<HTMLCanvasElement>;

  context?: CanvasRenderingContext2D | null;

  pixelRatio: number = 1;

  globalCompositionOperation: GlobalCompositeOperation[] = [
    'source-over',
    'source-in',
    'source-out',
    'source-atop',
    'destination-over',
    'destination-in',
    'destination-out',
    'destination-atop',
    'lighter',
    'copy',
    'xor',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ];

  private stageWidth: number = 0;
  private stageHeight: number = 0;
  private particles: GlowParticle[] = [];
  private animationId?: number;
  private colors: Array<{ r: number; g: number; b: number }> = LIGHT_PALETTE;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly ngZone: NgZone,
    private readonly themeService: NgDocThemeService,
  ) {
    afterNextRender(() => {
      this.context = this.canvas.nativeElement.getContext('2d');
      this.pixelRatio = window.devicePixelRatio > 1 ? 2 : 1;

      this.animationId = window.requestAnimationFrame(this.animate.bind(this));

      fromEvent(window, 'resize')
        .pipe(debounceTime(100), untilDestroyed(this), ngDocZoneDetach(this.ngZone))
        .subscribe(() => this.resize());

      // this.themeService
      //   .themeChanges()
      //   .pipe(startWith(this.themeService.currentTheme), untilDestroyed(this))
      //   .subscribe((theme: NgDocTheme | 'auto' | undefined) => {
      //     this.colors = theme ? DARK_PALETTE : LIGHT_PALETTE;
      //     this.resize();
      //     this.setCompositionOperation(theme ? 'multiply' : 'screen');
      //   });
    });
  }

  resize(): void {
    if (this.context) {
      this.stageWidth = this.elementRef.nativeElement.offsetWidth;
      this.stageHeight = this.elementRef.nativeElement.offsetHeight;

      this.canvas.nativeElement.width = this.stageWidth * this.pixelRatio;
      this.canvas.nativeElement.height = this.stageHeight * this.pixelRatio;
      this.context?.scale(this.pixelRatio, this.pixelRatio);

      this.createCircles();
    }
  }

  animate(): void {
    this.animationId = window.requestAnimationFrame(this.animate.bind(this));

    if (this.context) {
      this.context.clearRect(0, 0, this.stageWidth, this.stageHeight);

      for (let i = 0; i < this.totalParticles; i++) {
        const item = this.particles[i];
        item.animate(this.context, this.stageWidth, this.stageHeight);
      }
    }
  }

  setCompositionOperation(compositionOperation: GlobalCompositeOperation): void {
    if (this.context) {
      this.context.globalCompositeOperation = compositionOperation;
    }
  }

  ngOnDestroy(): void {
    this.animationId && window.cancelAnimationFrame(this.animationId);
  }

  private createCircles(): void {
    let currentColor = 0;
    this.particles = [];

    for (let i = 0; i < this.totalParticles; i++) {
      const item = new GlowParticle(
        Math.random() * this.stageWidth,
        Math.random() * this.stageHeight,
        Math.random() * (this.maxRadius - this.minRadius) + this.minRadius,
        this.colors[currentColor],
      );

      if (++currentColor >= this.colors.length) {
        currentColor = 0;
      }

      this.particles[i] = item;
    }
  }
}

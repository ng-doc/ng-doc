const PI2 = Math.PI * 2;

export class GlowParticle {
	sinValue: number = Math.random();

	constructor(
		public x: number,
		public y: number,
		public radius: number,
		public rgb: {r: number; g: number; b: number; a?: number},
		public vx: number = Math.random() * 1.5,
		public vy: number = Math.random() * 1.5,
	) {}

	animate(ctx: CanvasRenderingContext2D, stageWidth: number, stageHeight: number) {
		this.sinValue += 0.01;
		this.radius += Math.sin(this.sinValue);
		this.x += this.vx;
		this.y += this.vy;

		if (this.x < 0) {
			this.vx *= -1;
			this.x += 10;
		} else if (this.x > stageWidth) {
			this.vx *= -1;
			this.x -= 10;
		}

		if (this.y < 0) {
			this.vy *= -1;
			this.y += 10;
		} else if (this.y > stageHeight) {
			this.vy *= -1;
			this.y -= 10;
		}

		ctx.beginPath();
		const g = ctx.createRadialGradient(this.x, this.y, this.radius * 0.01, this.x, this.y, this.radius);
		g.addColorStop(0, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.rgb.a ?? 1})`);
		g.addColorStop(1, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0)`);
		ctx.fillStyle = g;
		ctx.arc(this.x, this.y, this.radius, 0, PI2, false);
		ctx.fill();
	}
}

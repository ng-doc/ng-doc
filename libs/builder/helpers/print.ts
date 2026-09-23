import { clearLine, cursorTo } from 'readline';

const FRAMES: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const stream: NodeJS.WriteStream = process.stderr;
const isTTY: boolean = !!stream.isTTY && !process.env['CI'];

let interval: NodeJS.Timeout | undefined;
let frame: number = 0;
let message: string = '';

/**
 * Renders the current frame of the spinner.
 */
function render(): void {
  clearLine(stream, 0);
  cursorTo(stream, 0);
  stream.write(`${FRAMES[frame]} ${message}`);
  frame = (frame + 1) % FRAMES.length;
}

/**
 * Prints a progress message. If no message is passed, the message will be cleared.
 * @param text - The message to print.
 */
export function printProgress(text?: string): void {
  if (!isTTY) {
    if (text) {
      stream.write(`- NgDoc: ${text}\n`);
    }

    return;
  }

  if (interval) {
    clearInterval(interval);
    interval = undefined;
    clearLine(stream, 0);
    cursorTo(stream, 0);
  }

  if (text) {
    message = `NgDoc: ${text}`;
    render();
    // Do not keep the process alive only because of the spinner
    interval = setInterval(render, 80).unref();
  }
}

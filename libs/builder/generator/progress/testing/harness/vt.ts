/**
 * Minimal VT100 screen emulator. It replays raw terminal
 * bytes and answers "what does the user see": the screen, plus the scrollback that left the top.
 * It covers what NgDoc, Vite, Angular and the Nx TUI panes emit: CR/LF, cursor moves, erase in
 * line/display, scroll regions and the alternate screen. Autowrap is always on (as in the Nx pane).
 */
export class VirtualTerminal {
  private main: string[][];
  private buffer: string[][];
  private row = 0;
  private column = 0;
  private saved: [number, number] = [0, 0];
  private top = 0;
  private bottom: number;
  private pendingEscape = '';
  readonly scrollback: string[] = [];

  constructor(
    readonly rows: number,
    readonly columns: number,
  ) {
    this.main = this.blank();
    this.buffer = this.main;
    this.bottom = rows - 1;
  }

  /** Feeds decoded text; an escape sequence split across calls is completed by the next call. */
  feed(chunk: string): this {
    const data = this.pendingEscape + chunk;
    this.pendingEscape = '';
    let index = 0;
    while (index < data.length) {
      const char = data[index];
      if (char === '\x1b') {
        const rest = data.slice(index);
        // The terminal model parses escape sequences.
        // eslint-disable-next-line no-control-regex
        const csi = /^\x1b\[([?>]?)([0-9;]*)([ -/]*)([@-~])/.exec(rest);
        if (csi) {
          this.csi(csi[1], csi[2], csi[4]);
          index += csi[0].length;
          continue;
        }
        // eslint-disable-next-line no-control-regex
        const osc = /^\x1b\][^\x07\x1b]*(\x07|\x1b\\)/.exec(rest);
        if (osc) {
          index += osc[0].length;
          continue;
        }
        // eslint-disable-next-line no-control-regex
        if (/^\x1b(?:\[[?>]?[0-9;]*[ -/]*|\][^\x07\x1b]*|[()])?$/.test(rest)) {
          this.pendingEscape = rest;
          break;
        }
        const next = rest[1];
        if (next === '7') this.saved = [this.row, this.column];
        else if (next === '8') [this.row, this.column] = this.saved;
        index += next === '(' || next === ')' ? 3 : 2;
        continue;
      }
      if (char === '\r') this.column = 0;
      else if (char === '\n') {
        // A PTY translates LF to CR LF (onlcr); captures written without a PTY rely on it too.
        this.column = 0;
        this.lineFeed();
      } else if (char === '\b') this.column = Math.max(0, this.column - 1);
      else if (char === '\t')
        this.column = Math.min(this.columns - 1, (Math.floor(this.column / 8) + 1) * 8);
      else if (char >= ' ') this.put(char);
      index += char.length;
    }
    return this;
  }

  /** The visible screen, trailing blanks trimmed. */
  screen(): string {
    return this.buffer
      .map((row) => row.join('').trimEnd())
      .join('\n')
      .replace(/\n+$/, '');
  }

  /** Scrollback (oldest first) plus the main screen: the whole session as the user saw it. */
  transcript(): string {
    return [
      ...this.scrollback,
      this.main
        .map((row) => row.join('').trimEnd())
        .join('\n')
        .replace(/\n+$/, ''),
    ]
      .join('\n')
      .replace(/^\n+/, '');
  }

  private blank(): string[][] {
    return Array.from({ length: this.rows }, () => Array<string>(this.columns).fill(' '));
  }

  private put(char: string): void {
    if (this.column >= this.columns) {
      this.column = 0;
      this.lineFeed();
    }
    this.buffer[this.row][this.column] = char;
    this.column++;
  }

  private lineFeed(): void {
    if (this.row === this.bottom) this.scroll();
    else this.row = Math.min(this.rows - 1, this.row + 1);
  }

  private scroll(count: number = 1): void {
    for (let n = 0; n < count; n++) {
      const [line] = this.buffer.splice(this.top, 1);
      if (this.buffer === this.main && this.top === 0)
        this.scrollback.push(line.join('').trimEnd());
      this.buffer.splice(this.bottom, 0, Array<string>(this.columns).fill(' '));
    }
  }

  private csi(privateMarker: string, parameters: string, final: string): void {
    const values = parameters
      ? parameters.split(';').map((value) => (value ? Number(value) : 0))
      : [];
    const arg = (index: number, fallback = 1): number => (values[index] ? values[index] : fallback);
    if (privateMarker === '?') {
      if (
        (final === 'h' || final === 'l') &&
        values.some((value) => value === 1049 || value === 47 || value === 1047)
      ) {
        if (final === 'h') this.buffer = this.blank();
        else this.buffer = this.main;
      }
      return;
    }
    const row = this.buffer[this.row];
    switch (final) {
      case 'H':
      case 'f':
        this.row = Math.min(this.rows - 1, arg(0) - 1);
        this.column = Math.min(this.columns - 1, arg(1) - 1);
        break;
      case 'A':
        this.row = Math.max(0, this.row - arg(0));
        break;
      case 'B':
        this.row = Math.min(this.rows - 1, this.row + arg(0));
        break;
      case 'C':
        this.column = Math.min(this.columns - 1, this.column + arg(0));
        break;
      case 'D':
        this.column = Math.max(0, this.column - arg(0));
        break;
      case 'G':
        this.column = Math.min(this.columns - 1, arg(0) - 1);
        break;
      case 'K': {
        const mode = arg(0, 0);
        const [from, to] =
          mode === 0
            ? [this.column, this.columns]
            : mode === 1
              ? [0, this.column + 1]
              : [0, this.columns];
        for (let k = from; k < Math.min(to, this.columns); k++) row[k] = ' ';
        break;
      }
      case 'J': {
        const mode = arg(0, 0);
        if (mode === 2 || mode === 3) this.buffer.splice(0, this.rows, ...this.blank());
        else if (mode === 0) {
          for (let k = this.column; k < this.columns; k++) row[k] = ' ';
          for (let r = this.row + 1; r < this.rows; r++)
            this.buffer[r] = Array<string>(this.columns).fill(' ');
        } else if (mode === 1)
          for (let r = 0; r < this.row; r++) this.buffer[r] = Array<string>(this.columns).fill(' ');
        break;
      }
      case 'r':
        this.top = arg(0) - 1;
        this.bottom = arg(1, this.rows) - 1;
        break;
      case 'S':
        this.scroll(arg(0));
        break;
      default:
        // Colours (m) and anything else do not move text.
        break;
    }
  }
}

/** Replays raw bytes into a fresh terminal. */
export function render(
  raw: string | Buffer,
  rows: number = 30,
  columns: number = 120,
): VirtualTerminal {
  return new VirtualTerminal(rows, columns).feed(
    typeof raw === 'string' ? raw : raw.toString('utf8'),
  );
}

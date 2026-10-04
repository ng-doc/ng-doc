#!/usr/bin/env python3
"""Test-only PTY runner: real terminal behaviour without an npm PTY dependency.

Usage: pty-run.py ROWS COLS TIMEOUT_SECONDS OUT_FILE COMMAND [ARGS...]

Runs COMMAND in a pseudo-terminal of a fixed size and writes every byte it prints to OUT_FILE.
With PTY_CTRL_C_ON=<text>, it types Ctrl-C once the output contains that text: the terminal then
sends SIGINT to the foreground process group, as a keyboard does. With PTY_KILL_ON=<text> and
PTY_KILL_SIGNAL=<TERM|HUP|...>, it sends that signal to the program once the output contains the
text, as a process manager or a closed terminal window does.
Prints one JSON line: {"exit": code | null, "signal": n | null, "timeout": bool, "bytes": n}.
On timeout the child's process group is killed, so nothing is left running.
"""
import fcntl, json, os, pty, select, signal, struct, sys, termios, time

rows, cols, timeout, out = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
command = sys.argv[5:]
pid, fd = pty.fork()
if pid == 0:
    # Size the terminal before the program starts, so its first isatty/columns read is right.
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    os.execvp(command[0], command)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
os.kill(pid, signal.SIGWINCH)
chunks, deadline, status, timed_out = [], time.time() + timeout, None, False
ctrl_c_on = os.environ.get('PTY_CTRL_C_ON', '').encode()
kill_on = os.environ.get('PTY_KILL_ON', '').encode()
kill_signal = getattr(signal, 'SIG' + os.environ.get('PTY_KILL_SIGNAL', 'TERM'))
while True:
    if time.time() > deadline:
        timed_out = True
        try: os.killpg(pid, signal.SIGKILL)
        except OSError: pass
        try: os.kill(pid, signal.SIGKILL)
        except OSError: pass
        _, status = os.waitpid(pid, 0)
        break
    ready, _, _ = select.select([fd], [], [], 0.05)
    if ready:
        try: data = os.read(fd, 65536)
        except OSError: data = b''
        if data: chunks.append(data)
        if ctrl_c_on and ctrl_c_on in b''.join(chunks):
            ctrl_c_on = b''
            os.write(fd, b'\x03')
        if kill_on and kill_on in b''.join(chunks):
            kill_on = b''
            os.kill(pid, kill_signal)
    done, st = os.waitpid(pid, os.WNOHANG)
    if done:
        status = st
        try:
            while True:
                ready, _, _ = select.select([fd], [], [], 0.2)
                if not ready: break
                data = os.read(fd, 65536)
                if not data: break
                chunks.append(data)
        except OSError: pass
        break
os.close(fd)
with open(out, 'wb') as handle:
    handle.write(b''.join(chunks))
print(json.dumps({
    'exit': os.WEXITSTATUS(status) if os.WIFEXITED(status) else None,
    'signal': os.WTERMSIG(status) if os.WIFSIGNALED(status) else None,
    'timeout': timed_out,
    'bytes': sum(len(c) for c in chunks),
}))

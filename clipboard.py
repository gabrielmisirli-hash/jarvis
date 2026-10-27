"""Put text on the user's clipboard.

JARVIS speaks; a formula, a macro or a DAX measure cannot be spoken. So the
code goes to the clipboard and the user pastes it where it belongs.

No new dependencies: each platform's own clipboard command, spawned with an
argument list (never a shell string), fed on stdin, and time-boxed.

- Windows: Windows PowerShell's `Set-Clipboard`, reading UTF-8 off stdin.
  Not `clip.exe`: it reads stdin in the console code page, so "MÉDIASES"
  arrives mangled — and fed a UTF-16 byte-order mark to fix that, it keeps
  the mark as an invisible first character, and a formula pasted into Excel
  behind one is text, not a formula. Measured, both.
- macOS: `pbcopy`, with a UTF-8 locale for the same reason.
- Linux: `wl-copy`, then `xclip`, whichever exists.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import sys

COPY_TIMEOUT_SEC = 5.0

# A whole module of VBA is a few thousand characters; this is a backstop
# against the brain pasting a document into the clipboard, not a style rule.
MAX_CHARS = 20_000


class ClipboardError(Exception):
    """The clipboard could not be written. The message is safe to speak."""


_WIN_SCRIPT = ("[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false; "
               "Set-Clipboard -Value ([Console]::In.ReadToEnd())")


def _command() -> tuple[list[str], str]:
    """(argv, encoding) for this platform's clipboard writer."""
    if sys.platform == "win32":
        return ["powershell.exe", "-NoProfile", "-NonInteractive",
                "-Command", _WIN_SCRIPT], "utf-8"
    if sys.platform == "darwin":
        return ["pbcopy"], "utf-8"
    for argv in (["wl-copy"], ["xclip", "-selection", "clipboard"]):
        if shutil.which(argv[0]):
            return argv, "utf-8"
    raise ClipboardError("there is no clipboard tool on this machine")


async def _run(argv: list[str], data: bytes) -> int:
    env = dict(os.environ)
    if sys.platform == "darwin":
        env.setdefault("LANG", "en_US.UTF-8")
    proc = await asyncio.create_subprocess_exec(
        *argv, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        env=env)
    try:
        await asyncio.wait_for(proc.communicate(data), timeout=COPY_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        proc.kill()
        raise ClipboardError("the clipboard did not answer")
    return proc.returncode


async def copy(text: str) -> None:
    """Replace the clipboard's contents with `text`. Raises ClipboardError."""
    if len(text) > MAX_CHARS:
        raise ClipboardError("that is too long for the clipboard")
    argv, encoding = _command()
    if sys.platform == "win32":
        # The clipboard keeps line endings as given; Office wants CRLF.
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    data = text.encode(encoding)
    try:
        rc = await _run(argv, data)
    except FileNotFoundError:
        raise ClipboardError("there is no clipboard tool on this machine")
    if rc != 0:
        raise ClipboardError("the clipboard refused it")

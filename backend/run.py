#!/usr/bin/env python3
"""
Start the whole backend, and serve the UI from the same process.

    python run.py              # serve API + UI on http://127.0.0.1:8000
    python run.py --build      # rebuild the UI first, then serve
    python run.py --tunnel     # also open a public Cloudflare URL
    python run.py --port 8080  # different port

Why one process
---------------
Serving the built UI from FastAPI makes the app single-origin, so the browser
issues same-origin requests and CORS is never involved. The UI's API client
uses a relative base URL, which means the same build works unchanged whether
it is served by this process or deployed to Vercel/Netlify with VITE_API_URL
pointing somewhere else.

What it sets up
---------------
* a virtualenv, if there isn't one
* Python dependencies, if they're missing or requirements.txt changed
* a .env, copied from .env.example if you have not created one
* the UI build, when asked or when dist/ is missing

Secrets are never invented. If .env is missing a JWT_SECRET the server will
refuse to start in production, which is the intended behaviour.
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
VENV = BACKEND / "venv"
TUNNEL_BIN = BACKEND / ".cloudflared"

IS_WINDOWS = os.name == "nt"


def say(message: str) -> None:
    print(f"  {message}", flush=True)


def fail(message: str):
    print(f"\n  ERROR: {message}\n", file=sys.stderr, flush=True)
    raise SystemExit(1)


def venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


# --------------------------------------------------------------------- setup
def ensure_venv() -> Path:
    python = venv_python()
    if python.exists():
        return python
    say("creating virtualenv...")
    if subprocess.run([sys.executable, "-m", "venv", str(VENV)], cwd=BACKEND).returncode:
        fail("could not create the virtualenv. Try: python3 -m venv venv")
    return python


def ensure_deps(python: Path) -> None:
    marker = VENV / ".requirements-sha"
    wanted = (BACKEND / "requirements.txt").read_bytes()
    if marker.exists() and marker.read_bytes() == wanted:
        return
    say("installing dependencies (first run takes a minute)...")
    if subprocess.run([str(python), "-m", "pip", "install", "-q",
                       "-r", "requirements.txt"], cwd=BACKEND).returncode:
        fail("pip install failed. Check your connection and try again.")
    marker.write_bytes(wanted)


def ensure_env() -> None:
    env = BACKEND / ".env"
    if env.exists():
        return
    example = BACKEND / ".env.example"
    if not example.exists():
        fail("no .env and no .env.example to copy. Create backend/.env by hand.")
    shutil.copyfile(example, env)
    say("created backend/.env from .env.example - fill in the blanks")


def build_ui() -> None:
    if not FRONTEND.exists():
        fail(f"frontend/ not found at {FRONTEND}")
    npm = shutil.which("npm")
    if not npm:
        fail("npm is not on PATH. Install Node.js 18+ to build the UI.")
    if not (FRONTEND / "node_modules").exists():
        say("installing UI dependencies...")
        subprocess.run([npm, "install", "--no-audit", "--no-fund"],
                       cwd=FRONTEND, check=True)
    say("building the UI...")
    if subprocess.run([npm, "run", "build"], cwd=FRONTEND).returncode:
        fail("the UI build failed. See the output above.")


# -------------------------------------------------------------------- tunnel
def download_cloudflared() -> Path:
    if TUNNEL_BIN.exists():
        return TUNNEL_BIN
    machine = platform.machine()
    system = platform.system()
    if system == "Darwin":
        asset = "cloudflared-darwin-amd64.tgz"
    elif system == "Windows":
        asset = "cloudflared-windows-amd64.exe"
    else:
        asset = "cloudflared-linux-amd64" if machine in ("x86_64", "amd64") \
            else "cloudflared-linux-arm64"
    url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/{asset}"
    say("downloading cloudflared (one time, ~40 MB)...")
    if subprocess.run(["curl", "-fsSL", url, "-o", str(TUNNEL_BIN)], cwd=BACKEND).returncode:
        fail("could not download cloudflared. Get it from cloudflare.com and retry.")
    TUNNEL_BIN.chmod(0o755)
    return TUNNEL_BIN


def start_tunnel(port: int):
    binary = download_cloudflared()
    say("opening a public tunnel...")
    proc = subprocess.Popen(
        [str(binary), "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"],
        cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    public_url = ""
    deadline = time.time() + 60
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        if "trycloudflare.com" in line:
            public_url = line.strip().split()[-1].rstrip("/")
            break
    if not public_url:
        proc.terminate()
        fail("the tunnel did not report a URL within 60s. Check your network.")
    return proc, public_url


# --------------------------------------------------------------------- serve
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the backend, serving the UI from the same process.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1",
                        help="127.0.0.1 local only, 0.0.0.0 to allow a tunnel")
    parser.add_argument("--build", action="store_true", help="rebuild the UI first")
    parser.add_argument("--tunnel", action="store_true",
                        help="also expose it on a public Cloudflare URL")
    parser.add_argument("--no-ui", action="store_true", help="API only")
    args = parser.parse_args()

    print("\n  Smart Email Assistant - backend\n  " + "-" * 46)

    python = ensure_venv()
    ensure_deps(python)
    ensure_env()

    if args.build or (not args.no_ui and not (DIST / "index.html").exists()):
        build_ui()
    elif not args.no_ui:
        say(f"using the existing UI build at {DIST}")

    tunnel = public_url = None
    if args.tunnel:
        tunnel, public_url = start_tunnel(args.port)

    print()
    say(f"API and UI   http://{args.host}:{args.port}")
    if public_url:
        say(f"public URL   {public_url}")
        say("share that URL with whoever needs access")
    say("stop with Ctrl+C")
    print()

    import uvicorn
    try:
        uvicorn.run("app.main:app", host=args.host, port=args.port, log_level="info")
    finally:
        if tunnel is not None:
            tunnel.terminate()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Serve the extension so sidebar/sidebar.html renders as an ordinary page.

The sidebar is browser chrome in Firefox, which no page-automation tool can
screenshot. But the panel itself is just HTML, so serving the extension root
and injecting a WebExtension shim gives a faithful, screenshot-able copy of the
real interface -- same markup, same CSS, same themes, no API key.

    python3 screenshot-harness/serve.py
    open http://localhost:8777/sidebar/sidebar.html?theme=catppuccin-mocha

Themes: catppuccin-latte | catppuccin-frappe | catppuccin-macchiato | catppuccin-mocha
"""
import http.server
import pathlib
import socketserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHIM = '<script src="/screenshot-harness/shim.js"></script>'
PORT = 8777


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        # Inject the shim ahead of every other script in the sidebar page.
        if self.path.split("?")[0] == "/sidebar/sidebar.html":
            html = (ROOT / "sidebar" / "sidebar.html").read_text()
            html = html.replace("<head>", "<head>\n  " + SHIM, 1)
            body = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} on http://localhost:{PORT}")
        print(f"  http://localhost:{PORT}/sidebar/sidebar.html?theme=catppuccin-mocha")
        httpd.serve_forever()

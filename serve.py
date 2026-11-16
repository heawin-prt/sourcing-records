"""开发/局域网测试用的静态服务器：和 python -m http.server 一样，
但加上 Cache-Control: no-cache，保证手机每次都拿到最新代码（否则浏览器可能继续用旧的 JS）。

用法：python serve.py [端口，默认 8765]
"""
import functools
import http.server
import os
import sys

APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


NoCacheHandler.extensions_map.update({
    '.js': 'text/javascript',
    '.webmanifest': 'application/manifest+json',
    '.wasm': 'application/wasm',
    '.gz': 'application/octet-stream',  # 语言模型由识别引擎自己解压，不能让浏览器解压
})

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=APP_DIR)
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'Serving {APP_DIR} on port {port} (no-cache)')
        httpd.serve_forever()

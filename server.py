# -*- coding: utf-8 -*-
"""CS2 道具点位库 —— 本地服务（只监听 127.0.0.1:8778）

为什么需要它：
  1. 网页想直接写磁盘必须走 File System Access API，而它的写权限每次开浏览器
     都要用户点一次重新授权。改由本机服务代写，就完全不需要授权。
  2. 描点图片需要落盘到 resource/props/，浏览器同样做不到。

接口：
  GET  /api/ping    -> {"ok":true,...}                    页面启动时探测可用性
  GET  /api/data    -> data.json 的内容                    (file:// 打开的页面读不到本地文件，必须走这里)
  POST /api/data    -> 原子写入 data.json，上一版留成 data.json.bak
  GET  /api/images  -> resource/props/ 下的图片文件名列表
  POST /api/upload  -> 原始字节写入 resource/props/，文件名走 X-Filename 头
  POST /api/images/delete -> {"names":[...]} 删除 resource/props/ 下的指定图片
其他路径按普通静态文件返回（等价于 python -m http.server）。

端口被占用时静默退出（0），所以可以重复启动、也可以放进开机启动项。
"""

import datetime
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import sys
import tempfile
import urllib.parse

BIND = '127.0.0.1'
PORT = 8778
if '--port' in sys.argv:                      # 仅供测试用；日常不传
    PORT = int(sys.argv[sys.argv.index('--port') + 1])
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data.json')
BAK = os.path.join(ROOT, 'data.json.bak')
LOG = os.path.join(ROOT, 'server.log')
PROPS_DIR = os.path.join(ROOT, 'resource', 'props')
MAX_BODY = 64 * 1024 * 1024
MAX_UPLOAD = 32 * 1024 * 1024

IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'}
# 文件名里不能出现的字符（Windows：\ / : * ? " < > |）以及控制字符；
# 中文等其它字符一律保留，这样「道具名-1.jpg」这类命名才有意义。
SAFE_NAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]')

# 只接受本机来源：file:// 打开的页面 Origin 是字面量 'null'，缺省则视为本机
ALLOWED_ORIGINS = {None, '', 'null',
                   'http://%s:%d' % (BIND, PORT),
                   'http://localhost:%d' % PORT}


def log(msg):
    line = '[%s] %s' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


def unique_path(folder, base, ext):
    """在 folder 下找一个不冲突的文件名，返回绝对路径。"""
    cand = os.path.join(folder, base + ext)
    n = 1
    while os.path.exists(cand):
        cand = os.path.join(folder, base + '_%d' % n + ext)
        n += 1
    return cand


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        kwargs['directory'] = ROOT
        super().__init__(*args, **kwargs)

    def end_headers(self):
        # 所有响应都不缓存，本地改文件后浏览器刷新即可看到最新版
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # ---- 工具 ----
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-Save-As')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _api_path(self):
        return self.path.split('?', 1)[0].rstrip('/') or '/'

    def _body_len(self):
        try:
            return int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return 0

    # ---- 路由 ----
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        p = self._api_path()
        if p == '/api/ping':
            return self._json({'ok': True, 'port': PORT, 'writable': True,
                               'dataExists': os.path.exists(DATA),
                               'propsDir': os.path.isdir(PROPS_DIR)})
        if p == '/api/data':
            if not os.path.exists(DATA):
                return self._json({'ok': False, 'error': 'data.json 不存在'}, 404)
            with open(DATA, 'rb') as f:
                body = f.read()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if p == '/api/images':
            return self._json({'ok': True, 'images': self._list_images()})
        return super().do_GET()

    def _list_images(self):
        if not os.path.isdir(PROPS_DIR):
            return []
        out = []
        for name in sorted(os.listdir(PROPS_DIR)):
            ext = os.path.splitext(name)[1].lower()
            if ext in IMAGE_EXT and os.path.isfile(os.path.join(PROPS_DIR, name)):
                out.append(name)
        return out

    def do_POST(self):
        p = self._api_path()
        if p == '/api/data':
            return self._save_data()
        if p == '/api/upload':
            return self._upload()
        if p == '/api/images/delete':
            return self._delete_images()
        return self._json({'ok': False, 'error': 'not found'}, 404)

    def _origin_ok(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            return True
        log('! 拒绝写入：来源不被允许 Origin=%r' % origin)
        return False

    def _save_data(self):
        if not self._origin_ok():
            return self._json({'ok': False, 'error': 'origin not allowed'}, 403)

        n = self._body_len()
        if n <= 0 or n > MAX_BODY:
            return self._json({'ok': False, 'error': 'bad content-length'}, 400)

        raw = self.rfile.read(n)
        try:
            obj = json.loads(raw.decode('utf-8'))
        except Exception as e:
            log('! 拒绝写入：JSON 解析失败 %s' % e)
            return self._json({'ok': False, 'error': 'invalid json: %s' % e}, 400)
        if not isinstance(obj, dict) or not isinstance(obj.get('spots'), list):
            return self._json({'ok': False, 'error': '缺少 spots 数组'}, 400)

        # 统一在这里规范化并缩进输出，客户端不必关心文件长什么样。
        # 只保留 meta / mapOrder / spots；place 是已下线的「地点名」功能残留，直接丢掉。
        meta = obj.get('meta') if isinstance(obj.get('meta'), dict) else {}
        meta.setdefault('version', 3)
        meta.setdefault('app', 'cs2-props')
        for s in obj['spots']:
            if isinstance(s, dict):
                s.pop('place', None)
        map_order = obj.get('mapOrder') if isinstance(obj.get('mapOrder'), list) else []
        text = json.dumps({'meta': meta, 'mapOrder': map_order, 'spots': obj['spots']},
                          ensure_ascii=False, indent=2) + '\n'
        blob = text.encode('utf-8')

        try:
            if os.path.exists(DATA):
                shutil.copy2(DATA, BAK)
            fd, tmp = tempfile.mkstemp(dir=ROOT, prefix='.data-', suffix='.tmp')
            with os.fdopen(fd, 'wb') as f:
                f.write(blob)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, DATA)          # 原子替换，避免写一半损坏
        except OSError as e:
            log('! 写入失败：%s' % e)
            return self._json({'ok': False, 'error': 'write failed: %s' % e}, 500)

        log('已写入 data.json：%d 个点位 / %d 项地图排序 / %d 字节'
            % (len(obj['spots']), len(map_order), len(blob)))
        return self._json({'ok': True, 'spots': len(obj['spots']), 'bytes': len(blob)})

    def _upload(self):
        if not self._origin_ok():
            return self._json({'ok': False, 'error': 'origin not allowed'}, 403)

        n = self._body_len()
        if n <= 0 or n > MAX_UPLOAD:
            return self._json({'ok': False, 'error': '图片为空或超过 32MB'}, 400)

        raw_name = self.headers.get('X-Filename') or ''
        save_as = self.headers.get('X-Save-As') or ''
        try:
            raw_name = urllib.parse.unquote(raw_name)
            save_as = urllib.parse.unquote(save_as)
        except Exception:
            pass
        raw_name = os.path.basename(raw_name.replace('\\', '/'))
        stem, ext = os.path.splitext(raw_name)
        ext = ext.lower()
        if ext not in IMAGE_EXT:
            return self._json({'ok': False, 'error': '不支持的图片格式：%s' % (ext or '无扩展名')}, 400)

        # 页面按「道具名」指定基名（X-Save-As）时，自动补「-序号」，不再加时间戳前缀
        want = SAFE_NAME.sub('_', os.path.basename(save_as.replace('\\', '/'))).strip(' ._')[:48]

        try:
            os.makedirs(PROPS_DIR, exist_ok=True)
            if want:
                stems = {os.path.splitext(fn)[0] for fn in os.listdir(PROPS_DIR)}
                k = 1
                while '%s-%d' % (want, k) in stems:
                    k += 1
                base = '%s-%d' % (want, k)
            else:
                stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
                base = '%s_%s' % (stamp, SAFE_NAME.sub('_', stem).strip(' ._')[:48] or 'img')
            dest = unique_path(PROPS_DIR, base, ext)
            with open(dest, 'wb') as f:
                remaining = n
                while remaining > 0:
                    chunk = self.rfile.read(min(262144, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
        except OSError as e:
            log('! 图片写入失败：%s' % e)
            return self._json({'ok': False, 'error': 'write failed: %s' % e}, 500)

        rel = 'resource/props/' + os.path.basename(dest)
        log('已保存图片 %s（%d 字节）' % (rel, n))
        return self._json({'ok': True, 'path': rel, 'name': os.path.basename(dest)})

    def _delete_images(self):
        """删除 resource/props/ 下的指定图片。只接受纯文件名，
        含路径分隔符或 .. 的一律拒绝，保证删不到 props 目录以外。"""
        if not self._origin_ok():
            return self._json({'ok': False, 'error': 'origin not allowed'}, 403)

        n = self._body_len()
        if n <= 0 or n > MAX_BODY:
            return self._json({'ok': False, 'error': 'bad content-length'}, 400)

        raw = self.rfile.read(n)
        try:
            obj = json.loads(raw.decode('utf-8'))
        except Exception as e:
            return self._json({'ok': False, 'error': 'invalid json: %s' % e}, 400)
        names = obj.get('names')
        if not isinstance(names, list):
            return self._json({'ok': False, 'error': '缺少 names 数组'}, 400)

        deleted, failed = [], []
        for name in names:
            if not isinstance(name, str) or not name:
                failed.append({'name': name, 'error': '非法文件名'})
                continue
            # basename 后必须与原值一致，否则说明带了路径，直接拒绝
            base = os.path.basename(name.replace('\\', '/'))
            if base != name or base in ('.', '..'):
                failed.append({'name': name, 'error': '非法文件名'})
                continue
            if os.path.splitext(base)[1].lower() not in IMAGE_EXT:
                failed.append({'name': base, 'error': '不是图片'})
                continue
            target = os.path.join(PROPS_DIR, base)
            if not os.path.isfile(target):
                failed.append({'name': base, 'error': '文件不存在'})
                continue
            try:
                os.remove(target)
                deleted.append(base)
            except OSError as e:
                failed.append({'name': base, 'error': str(e)})

        log('已删除 %d 张图片%s' % (len(deleted),
                                  ('，%d 张失败' % len(failed)) if failed else ''))
        return self._json({'ok': True, 'deleted': deleted, 'failed': failed})

    def log_message(self, fmt, *args):
        pass          # 静态请求不刷屏，只记录 API 写入


class Server(socketserver.ThreadingTCPServer):
    # ⚠️ 必须保持 False（即不要设 SO_REUSEADDR）。
    # Windows 的 SO_REUSEADDR 语义与 Linux 相反：设了它反而**允许两个进程绑定同一个端口**，
    # 于是"端口被占用就退出"的判断会失效，多个实例会同时监听、请求随机落到其中一个。
    # 不设它，Windows 才会严格拒绝第二次绑定 —— 这正是幂等启动需要的。
    allow_reuse_address = False
    daemon_threads = True


def port_in_use():
    """在真正绑定前先探一次：用未设 SO_REUSEADDR 的裸 socket 试绑，失败即说明已被监听。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind((BIND, PORT))
        return False
    except OSError:
        return True
    finally:
        s.close()


def main():
    if port_in_use():
        log('端口 %d 已在监听，本次不重复启动' % PORT)
        return 0
    try:
        srv = Server((BIND, PORT), Handler)
    except OSError as e:
        log('端口 %d 已被占用，本次不重复启动（%s）' % (PORT, e))
        return 0
    log('服务已启动 http://%s:%d/   根目录 %s' % (BIND, PORT, ROOT))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        log('服务已停止')
    return 0


if __name__ == '__main__':
    sys.exit(main())
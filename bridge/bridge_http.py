"""HTTP transport and connection diagnostics shared by the Mac launchers."""
from __future__ import annotations

import http.client
import json
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from mac_ocr.tls_config import verified_ssl_context


class BridgeRequestError(RuntimeError):
    def __init__(self, message, *, retryable=False):
        super().__init__(message)
        self.retryable = retryable


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # The AutoVJ token is scoped to the configured host.
        return None


def normalize_url(raw):
    url = raw.strip().rstrip('/')
    if any(ord(ch) <= 32 or ord(ch) == 127 for ch in url):
        raise ValueError('URLに空白または制御文字が含まれています。')
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        raise ValueError('Vercelの本番URLのホスト名とポートを確認してください。') from None
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')):
        raise ValueError('https:// で始まるAutoVJの本番URLを指定してください。')
    if (not parsed.hostname or port == 0 or '@' in parsed.netloc or '\\' in parsed.netloc
            or parsed.query or parsed.fragment or parsed.path or '?' in url or '#' in url):
        raise ValueError('URLは AutoVJ Web のトップページのURLを指定してください。')
    return url


def read_json_response(response):
    try:
        result = json.loads(response.read(32768))
    except (ValueError, OSError, http.client.HTTPException):
        return {}
    return result if isinstance(result, dict) else {}


def http_error(status, payload):
    code = payload.get('code')
    legacy = payload.get('error')
    if status == 503 and (code == 'AUTOVJ_TOKEN_NOT_CONFIGURED' or legacy == 'VercelのAUTOVJ_ACCESS_TOKENを設定してください'):
        return BridgeRequestError('HTTP 503 / VercelのProductionに AUTOVJ_ACCESS_TOKEN を設定し、再デプロイしてください。')
    if status == 401 and (code == 'AUTOVJ_TOKEN_REJECTED' or legacy == 'アクセストークンを確認してください'):
        return BridgeRequestError('HTTP 401 / AutoVJの認証エラー。VercelのProduction値を確認し、Macで CONFIGURE_AUTOVJ.command から同じ値を再入力してください。')
    if status in (401, 403) or 300 <= status < 400:
        return BridgeRequestError(f'HTTP {status} / AutoVJ APIの認証応答を確認できません。Vercelの本番URLと Deployment Protection を確認してください。')
    if status == 404:
        return BridgeRequestError('HTTP 404 / 本番URLに /api/bridge が見つかりません。Vercelのデプロイとプロジェクトルートを確認してください。')
    if status == 503 and (code == 'AUTOVJ_REDIS_NOT_CONFIGURED' or legacy == 'VercelのRedis環境変数を設定してください'):
        return BridgeRequestError('HTTP 503 / VercelのProductionにUpstash RedisのURLとRESTトークンを設定し、再デプロイしてください。')
    if status == 503 and (code == 'AUTOVJ_REDIS_UNAVAILABLE' or legacy == 'ブリッジの保存先に接続できません'):
        return BridgeRequestError('HTTP 503 / AutoVJ認証後にUpstash Redisへの接続で失敗しました。RedisのURLと書き込み可能なRESTトークンを確認してください。', retryable=True)
    return BridgeRequestError(f'HTTP {status} / Vercelのデプロイログを確認してください。', retryable=status == 429 or status >= 500)


def request(url, token, *, decks=None):
    data = None if decks is None else json.dumps({'decks': decks}, ensure_ascii=False).encode('utf-8')
    headers = {'Accept': 'application/json', 'X-AutoVJ-Token': token, 'User-Agent': 'AutoVJ-Web-MacBridge/6.4.1'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url + '/api/bridge', data=data, headers=headers)
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=verified_ssl_context()))
    try:
        with opener.open(req, timeout=10) as response:
            payload = read_json_response(response)
    except urllib.error.HTTPError as error:
        with error:
            raise http_error(error.code, read_json_response(error)) from None
    except (OSError, http.client.HTTPException):
        raise BridgeRequestError('接続できません。ネットワーク、Macの時刻、Pythonの証明書を確認してください。', retryable=True) from None
    if (data is None and 'state' not in payload) or (data is not None and payload.get('ok') is not True):
        raise BridgeRequestError('AutoVJ APIの応答を確認できません。Macの設定にVercelの本番URLを入力してください。')
    return payload

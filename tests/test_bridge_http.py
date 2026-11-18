import contextlib
import http.server
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
import autovj_launcher as launcher
from bridge_http import BridgeRequestError, http_error, normalize_url, request


class BridgeTransportTests(unittest.TestCase):
    def test_local_api_and_no_redirect_token_forwarding(self):
        received = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                received.append((self.path, self.headers.get('X-AutoVJ-Token')))
                if self.server.redirect:
                    self.send_response(302)
                    self.send_header('Location', '/redirect-target')
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"state":null}')

            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"ok":true}')

            def log_message(self, *_):
                pass

        server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        server.redirect = False
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        try:
            self.assertEqual(request(origin, 'unit-test-token-only'), {'state': None})
            self.assertTrue(request(origin, 'unit-test-token-only', decks={'right': {'elapsed': 12}})['ok'])
            self.assertEqual(received[1]['decks']['right']['elapsed'], 12)
            server.redirect = True
            with self.assertRaisesRegex(BridgeRequestError, 'Deployment Protection'):
                request(origin, 'unit-test-token-only')
            self.assertEqual(len(received), 3)
            self.assertEqual(received[-1][0], '/api/bridge')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_errors_identify_application_auth_and_platform_response(self):
        rejected = http_error(401, {'code': 'AUTOVJ_TOKEN_REJECTED'})
        self.assertIn('CONFIGURE_AUTOVJ.command', str(rejected))
        self.assertFalse(rejected.retryable)
        self.assertIn('Deployment Protection', str(http_error(401, {})))
        self.assertIn('Redis', str(http_error(503, {'code': 'AUTOVJ_REDIS_UNAVAILABLE'})))
        self.assertTrue(http_error(503, {'code': 'AUTOVJ_REDIS_UNAVAILABLE'}).retryable)

    def test_invalid_origin_error_never_echoes_secret_query(self):
        with self.assertRaises(ValueError) as result:
            normalize_url('https://example.test?token=private-test-only')
        self.assertNotIn('private-test-only', str(result.exception))

    def test_reconfigure_existing_url_and_token_preserves_other_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'bridge_config.json'
            launcher.private_write(config, {'url': 'https://previous.example.test', 'token': 'previous-test-token', 'custom': 3})
            with patch.object(launcher, 'CONFIG', config), patch('builtins.input', return_value='https://current.example.test/'), \
                 patch.object(launcher.getpass, 'getpass', return_value='new-test-token-32-characters'), contextlib.redirect_stdout(io.StringIO()) as output:
                result = launcher.load_bridge_config(prompt=True, edit=True)
            self.assertEqual(result['url'], 'https://current.example.test')
            self.assertEqual(result['custom'], 3)
            self.assertEqual(json.loads(config.read_text())['token'], 'new-test-token-32-characters')
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('new-test-token', output.getvalue())

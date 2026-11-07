import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

module_path=Path(__file__).resolve().parents[1]/'bridge'/'autovj_launcher.py'
spec=importlib.util.spec_from_file_location('autovj_launcher',module_path)
launcher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

class OneClickTests(unittest.TestCase):
    def test_url_validation(self):
        self.assertEqual(launcher.normalize_url(' https://autovj.example.com/ '),'https://autovj.example.com')
        self.assertEqual(launcher.normalize_url('http://localhost:3000/'),'http://localhost:3000')
        for bad in ['http://example.com','https://foo.test/output.html','https://foo.test?token=secret',
                    'https://x:y@foo.test','file:///etc/passwd','javascript:alert(1)']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):launcher.normalize_url(bad)

    def test_private_config(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'secret.json'
            launcher.private_write(path,{'token':'supersecret'})
            self.assertEqual(launcher.read_json(path,{}),{'token':'supersecret'})
            self.assertEqual(path.stat().st_mode & 0o777,0o600)

    @patch.object(launcher,'existing_bridge',return_value=99)
    @patch.object(launcher,'ensure_venv')
    def test_running_bridge_not_launched_twice(self, venv, existing):
        self.assertEqual(launcher.launch_bridge(),99)
        venv.assert_not_called()

    @patch.object(launcher,'subprocess')
    def test_open_browser_uses_separate_windows_without_token(self, sub):
        sub.run.return_value=MagicMock(returncode=0)
        self.assertTrue(launcher.open_web('https://autovj.example.com',{'browser':'Google Chrome','open_output':True}))
        args=sub.run.call_args.args[0]
        self.assertEqual(args[0],'/usr/bin/osascript')
        self.assertEqual(args[-3:],['https://autovj.example.com/','https://autovj.example.com/output.html','true'])
        self.assertNotIn('token',str(args))
        self.assertIn('make new window',args[2])

    @patch.object(launcher,'subprocess')
    def test_launch_starts_bridge_detached_and_does_not_pass_token(self,sub):
        with tempfile.TemporaryDirectory() as td:
            tmp=Path(td)
            fake_py=tmp/'python'; fake_py.write_text('')
            with patch.object(launcher,'existing_bridge',return_value=None), \
                 patch.object(launcher,'other_bridge_process',return_value=None), \
                 patch.object(launcher,'ensure_venv',return_value=fake_py), \
                 patch.object(launcher,'STATE_DIR',tmp), \
                 patch.object(launcher,'LOGFILE',tmp/'bridge.log'), \
                 patch.object(launcher,'PIDFILE',tmp/'bridge_pid.json'), \
                 patch.object(launcher.time,'sleep'):
                sub.Popen.return_value=MagicMock(pid=456,poll=lambda:None)
                self.assertEqual(launcher.launch_bridge(),456)
                args=sub.Popen.call_args.args[0]
                self.assertEqual(args,[str(fake_py),str(launcher.BRIDGE_DIR/'rekordbox_bridge.py')])
                self.assertTrue(sub.Popen.call_args.kwargs['start_new_session'])
                self.assertEqual(launcher.read_json(tmp/'bridge_pid.json',{})['pid'],456)

    def test_applescript_contains_idempotent_window_detection(self):
        self.assertIn('liveFound',launcher.CHROME_SCRIPT)
        self.assertIn('outputFound',launcher.CHROME_SCRIPT)
        self.assertIn('liveFound',launcher.SAFARI_SCRIPT)
        self.assertIn('outputFound',launcher.SAFARI_SCRIPT)

if __name__=='__main__':unittest.main()

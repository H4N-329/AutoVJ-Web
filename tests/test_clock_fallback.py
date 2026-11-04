import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/'bridge'/'mac_ocr'
sys.path.insert(0,str(ROOT))
from playback_detector import parse_elapsed
import deck_capture
from PIL import Image


class OCRStub:
    def __init__(self,fast,accurate):
        self.fast=fast
        self.accurate=accurate
        self.calls=[]
    def recognize(self,crops,fast=False):
        self.calls.append((fast,len(crops)))
        return (self.fast if fast else self.accurate)[:len(crops)]


class ClockTests(unittest.TestCase):
    def test_parser(self):
        self.assertEqual(parse_elapsed('02:26.9'),146.9)
        self.assertEqual(parse_elapsed('00:00.0'),0)
        self.assertIsNone(parse_elapsed('-03:15.0'))
        self.assertIsNone(parse_elapsed('not a time'))

    def test_retry_one_failed_deck(self):
        stub=OCRStub(['garbled','00:12.3'],['00:14.5'])
        with patch.object(deck_capture,'screenshot',return_value=Image.new('RGB',(2000,1200))):
            values,source=deck_capture.capture_elapsed_fast(stub,deck_capture.default_config(),return_sources=True)
        self.assertEqual(values['left'],'00:14.5')
        self.assertEqual(values['right'],'00:12.3')
        self.assertEqual(source['left'],'accurate-fallback')
        self.assertEqual(source['right'],'fast')
        self.assertEqual(stub.calls,[(True,2),(False,1)])

    def test_both_good_no_retry(self):
        stub=OCRStub(['00:01.5','00:02.3'],[])
        with patch.object(deck_capture,'screenshot',return_value=Image.new('RGB',(2000,1200))):
            values,sources=deck_capture.capture_elapsed_fast(stub,deck_capture.default_config(),return_sources=True)
        self.assertEqual(sources,{'left':'fast','right':'fast'})
        self.assertEqual(stub.calls,[(True,2)])

    def test_both_bad_stay_unreadable(self):
        stub=OCRStub(['--:--','error'],['garbled','bad'])
        with patch.object(deck_capture,'screenshot',return_value=Image.new('RGB',(2000,1200))):
            values,sources=deck_capture.capture_elapsed_fast(stub,deck_capture.default_config(),return_sources=True)
        self.assertTrue(all(v=='unreadable' for v in sources.values()))


if __name__=='__main__':unittest.main()

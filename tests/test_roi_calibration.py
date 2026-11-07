"""ROI calibration geometry and saving tests (do not require macOS)."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/'bridge'
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'mac_ocr'))
from calibrate_regions import drag_to_roi, point_to_image
import deck_capture

class CalibrationTests(unittest.TestCase):
    def test_canvas_coordinates(self):
        self.assertEqual(point_to_image(100,50,0.5,2048,1131),(200,100))
        self.assertEqual(point_to_image(-4,2000,0.5,2048,1131),(0,1131))

    def test_timer_drag_maps_to_image_box(self):
        # A 2048x1131 screenshot rendered at 50% on the calibration canvas.
        roi=drag_to_roi((392,180),(418,194),(2048,1131),0.5)
        self.assertTrue(deck_capture.valid_roi(roi))
        self.assertEqual(deck_capture.roi_box(roi,(2048,1131)),(784,360,836,388))

    def test_drag_reverse_direction(self):
        roi1=drag_to_roi((100,120),(200,150),(2000,1100),1.0)
        roi2=drag_to_roi((200,150),(100,120),(2000,1100),1.0)
        self.assertEqual(roi1,roi2)

    def test_tiny_drag_not_saved(self):
        roi=drag_to_roi((100,100),(101,101),(2048,1131),0.5)
        self.assertFalse(deck_capture.valid_roi(roi))

    def test_save_read_preserves_6_boxes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            with patch.object(deck_capture,'DATA_DIR',p),patch.object(deck_capture,'CONFIG',p/'deck_capture_config.json'):
                cfg=deck_capture.default_config()
                cfg['display']=2
                cfg['rois']['left_elapsed']=[.31,.18,.055,.025]
                cfg['rois']['right_elapsed']=[.78,.18,.06,.025]
                deck_capture.save_config(cfg)
                read=deck_capture.read_config()
                self.assertEqual(read['display'],2)
                self.assertEqual(read['rois'],cfg['rois'])

    def test_invalid_roi_rejected(self):
        self.assertFalse(deck_capture.valid_roi([0.99,.2,.2,.02]))
        self.assertFalse(deck_capture.valid_roi([.2,.3,0,.02]))

if __name__ == '__main__':
    unittest.main()

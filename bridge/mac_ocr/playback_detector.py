"""Safely infer deck play/pause from OCR of the *elapsed* time label.

No hardware state, channel level or audible mix can be inferred from OCR alone.
This module deliberately ignores seeks, missing observations and unknown starts.
"""
from __future__ import annotations
from dataclasses import dataclass
import re
import unicodedata


def parse_elapsed(raw: str) -> float | None:
    text = unicodedata.normalize('NFKC', str(raw or '')).strip().replace(' ', '')
    text = text.replace('．', '.').replace('，', '.')
    # STRICT: never accept negative remaining-time indicators.
    if not text or text.startswith(('-', '−', '–')):
        return None
    match = re.fullmatch(r'(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,2}))?', text)
    if not match:
        return None
    if match.group(3) is None:
        minutes, seconds = int(match.group(1)), int(match.group(2))
        hours = 0
    else:
        hours, minutes, seconds = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if seconds > 59 or minutes > 59 and hours > 0:
        return None
    fraction = match.group(4)
    return hours * 3600 + minutes * 60 + seconds + (int(fraction) / (10 ** len(fraction)) if fraction else 0)


@dataclass
class DeckClock:
    key: str = ''
    prior_value: float | None = None
    prior_at: float | None = None
    moving_count: int = 0
    still_count: int = 0
    had_stable_pause: bool = False
    status: str = '不明'
    last_seen_at: float | None = None


class PlaybackDetector:
    """Requires 2 still samples before arming a start; 2 moving before PLAY.

    A first PLAYING observation after starting monitoring does not emit a start
    event; a definite PAUSE->PLAY transition (elapsed clock changes) is required.
    """
    def __init__(self, *, advance_samples: int = 2, pause_samples: int = 2):
        self.decks = {side: DeckClock() for side in ('left', 'right')}
        self.advance_samples = advance_samples
        self.pause_samples = pause_samples

    def observe(self, side: str, track_key: str, elapsed_raw: str, now: float, *, confirmed: bool = True):
        """Returns 'start' on an observed paused->playing edge, else None."""
        deck = self.decks[side]
        if not confirmed or not track_key:
            deck.prior_value = None
            deck.prior_at = None
            deck.moving_count = 0
            deck.status = '不明'
            return None
        if deck.key != track_key:
            self.decks[side] = deck = DeckClock(key=track_key)
        value = parse_elapsed(elapsed_raw)
        if value is None:
            if deck.last_seen_at is not None and now - deck.last_seen_at > 5.0:
                deck.status = '不明'
                deck.prior_value = None
                deck.prior_at = None
                deck.moving_count = 0
            return None
        deck.last_seen_at = now
        if deck.prior_value is None or deck.prior_at is None:
            deck.prior_value, deck.prior_at = value, now
            return None
        dt = now - deck.prior_at
        dv = value - deck.prior_value
        deck.prior_value, deck.prior_at = value, now
        if dt < 0.4 or dt > 22:
            deck.moving_count = deck.still_count = 0
            deck.status = '不明'
            return None
        if abs(dv) <= 0.25:
            deck.still_count += 1
            deck.moving_count = 0
            if deck.still_count >= self.pause_samples:
                deck.status = '停止'
                deck.had_stable_pause = True
            return None
        # Slow OCR may take 6–15 sec per cycle. Require near real-time progress
        # and 2 consecutive moving readings; never treat an arbitrary time jump
        # as play-state confirmation.
        min_rate, max_rate = (0.65, 1.45) if dt > 5 else (0.35, 2.5)
        if min_rate <= dv / dt <= max_rate and 0.25 < dv <= max(8, dt * 1.55):
            deck.moving_count += 1
            deck.still_count = 0
            if deck.moving_count >= self.advance_samples:
                was_stopped = deck.status == '停止' and deck.had_stable_pause
                deck.status = '再生中'
                deck.had_stable_pause = False
                return 'start' if was_stopped else None
            return None
        # A large discontinuity is a seek, scratch, loop wrap or OCR glitch.
        # Never interpret it as a play-start event.
        deck.moving_count = deck.still_count = 0
        deck.status = '不明'
        deck.had_stable_pause = False
        return None

    def status(self, side: str, now: float | None = None) -> str:
        deck = self.decks[side]
        if now is not None and (deck.last_seen_at is None or now - deck.last_seen_at > 22):
            return '不明'
        return deck.status

    def reset(self):
        self.decks = {side: DeckClock() for side in ('left', 'right')}

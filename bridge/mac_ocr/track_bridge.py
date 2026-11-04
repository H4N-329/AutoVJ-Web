"""Track-file bridge and conservative, cached official-MV candidate search.

Only reads a user-selected text file; never accesses rekordbox's private database.
"""
import html
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from tls_config import verified_ssl_context

DATA_DIR = Path.home() / 'Documents' / 'DJ' / 'AutoVJ_Data'
CACHE_FILE = DATA_DIR / 'mv_cache.json'


def normalize(s):
    s = html.unescape(str(s)).casefold()
    s = re.sub(r'\([^)]*(?:official|music video|mv|pv|歌ってみた|cover|lyrics|lyric|feat\.?)[^)]*\)', ' ', s)
    s = re.sub(r'[\W_]+', '', s, flags=re.UNICODE)
    return s


def parse_track(text, fmt='Artist - Title'):
    """Supported: 'Artist - Title', 'Title - Artist', or JSON {artist,title}."""
    s = text.strip().lstrip('\ufeff')
    if not s:
        return None
    try:
        value = json.loads(s)
        if isinstance(value, dict):
            artist = str(value.get('artist') or value.get('Artist') or '').strip()
            title = str(value.get('title') or value.get('Title') or '').strip()
            if artist and title:
                return {'artist': artist[:180], 'title': title[:180]}
    except (ValueError, TypeError):
        pass
    line = next((line.strip() for line in s.splitlines() if line.strip()), '')
    # Require an actual delimiter to avoid querying nonsensical strings.
    halves = re.split(r'\s+[-–—|]\s+', line, maxsplit=1)
    if len(halves) != 2 or not halves[0].strip() or not halves[1].strip():
        return None
    a, b = halves
    if fmt == 'Title - Artist':
        a, b = b, a
    return {'artist': a.strip()[:180], 'title': b.strip()[:180]}


def track_key(track):
    return normalize(track['artist']) + '::' + normalize(track['title'])


def read_cache():
    try:
        obj = json.loads(CACHE_FILE.read_text(encoding='utf-8'))
        if isinstance(obj, dict):
            return obj
    except (OSError, ValueError):
        pass
    return {}


def write_cache(cache):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp = CACHE_FILE.with_suffix('.tmp')
    temp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(CACHE_FILE)


def score_candidate(track, item):
    """Heuristic relevance score, NOT proof of uploader's identity."""
    snippet = item.get('snippet', {})
    title = html.unescape(snippet.get('title', ''))
    channel = html.unescape(snippet.get('channelTitle', ''))
    nt, na, nc = normalize(title), normalize(track['artist']), normalize(channel)
    song = normalize(track['title'])
    if not song or not na:
        return -99
    score = 0
    if song in nt:
        score += 65
    else:
        score -= 85
    if na in nt:
        score += 12
    if na in nc or nc in na and len(nc) >= 4:
        score += 23
    if any(w in title.lower() for w in ('official', 'music video', 'official mv', '【mv】', '【pv】', '公式')):
        score += 16
    if re.search(r'cover|歌ってみた|reaction|nightcore|sped up|slowed|karaoke|カラオケ|弾いてみた|踊ってみた|lyrics|lyric video', title, re.I):
        score -= 55
    return score


def search_mv(track, key):
    """Return ranked candidate dicts. HTTP failures propagate to GUI worker."""
    query = f"{track['artist']} {track['title']} official MV"
    params = urllib.parse.urlencode({'part': 'snippet', 'type': 'video', 'videoEmbeddable': 'true',
                                     'q': query, 'maxResults': 10, 'key': key, 'safeSearch': 'moderate'})
    req = urllib.request.Request('https://www.googleapis.com/youtube/v3/search?' + params,
                                 headers={'User-Agent': 'AutoVJ-Mac/3.0'})
    with urllib.request.urlopen(req, timeout=12, context=verified_ssl_context()) as r:
        data = json.load(r)
    result = []
    for item in data.get('items', []):
        vid = item.get('id', {}).get('videoId', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', vid):
            continue
        snippet = item.get('snippet', {})
        result.append({'id': vid, 'title': html.unescape(snippet.get('title', '')),
                       'channel': html.unescape(snippet.get('channelTitle', '')),
                       'score': score_candidate(track, item)})
    result.sort(key=lambda x: x['score'], reverse=True)
    return result

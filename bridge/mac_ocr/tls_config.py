"""Trusted certificate setup for outbound YouTube Data API HTTPS calls.

Python environments on macOS can lack a configured CA bundle. Extend the
system trust store with the current certifi Mozilla root bundle; never skip
server authentication or disable hostname verification.
"""
import ssl
from functools import lru_cache


@lru_cache(maxsize=1)
def verified_ssl_context():
    context = ssl.create_default_context()
    try:
        import certifi
    except ModuleNotFoundError:
        return context
    context.load_verify_locations(cafile=certifi.where())
    return context

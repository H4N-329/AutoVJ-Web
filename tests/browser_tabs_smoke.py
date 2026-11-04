"""Optional Chromium smoke test for tab navigation and saving settings.

Run: python tests/browser_tabs_smoke.py
Requires Playwright for Python and Chromium. This test uses data URLs so
no running HTTP server or external YouTube connection is required.
"""
from pathlib import Path
import base64
import os
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
shared=(root/'assets/shared.js').read_text(encoding='utf-8')
# The test document has an opaque origin; substitute a demo URL only in the test.
remote=(root/'assets/remote-host.js').read_text(encoding='utf-8').replace(
    "new URL('/controller.html',location.origin)",
    "new URL('/controller.html','https://example.invalid')"
)
app=(root/'assets/app.js').read_text(encoding='utf-8')
as_data=lambda s:'data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
app=app.replace("from './remote-host.js'",f"from '{as_data(remote)}'")
app=app.replace("from './shared.js'",f"from '{as_data(shared)}'")

with sync_playwright() as playwright:
    browser=playwright.chromium.launch(
        headless=True,
        executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),
        args=['--no-sandbox'],
    )
    page=browser.new_page(viewport={'width':1280,'height':850})
    errors=[]
    page.on('pageerror',lambda exc: errors.append(str(exc)))
    page.set_content((root/'index.html').read_text(encoding='utf-8'))
    page.evaluate('async (url) => await import(url)',as_data(app))
    page.locator('[data-tab="settings"]').click()
    assert page.locator('#tab-settings').is_visible(), 'Settings did not open'
    page.locator('#setting-lead').fill('0.7')
    page.locator('#save-settings').click()
    assert page.locator('#lead-value').inner_text()=='+0.7秒', 'Settings did not update'
    page.locator('[data-tab="search"]').click()
    assert page.locator('#tab-search').is_visible(), 'MV Search did not open'
    page.locator('[data-tab="live"]').click()
    assert page.locator('#tab-live').is_visible(), 'DJ LIVE did not reopen'
    assert not errors, errors
    print('PASS: Settings, saved value, MV Search, DJ LIVE, no JS exceptions')
    browser.close()

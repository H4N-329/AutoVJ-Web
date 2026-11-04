"""Browser integration smoke test: bridge clock update and missing clock.
Run: python tests/browser_clock_smoke.py (Chromium + Playwright installed).
"""
from pathlib import Path
import base64
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
shared=(root/'assets/shared.js').read_text(encoding='utf8')
remote=(root/'assets/remote-host.js').read_text(encoding='utf8').replace(
 "new URL('/controller.html',location.origin)",
 "new URL('/controller.html','https://example.invalid')")
app=(root/'assets/app.js').read_text(encoding='utf8')
as_data=lambda s:'data:text/javascript;base64,'+base64.b64encode(s.encode('utf8')).decode()
app=app.replace("from './remote-host.js'",f"from '{as_data(remote)}'")
app=app.replace("from './shared.js'",f"from '{as_data(shared)}'")
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':900})
 errors=[]
 page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.set_content((root/'index.html').read_text(encoding='utf8'))
 page.evaluate('''() => {window.__clock=32.4;window.fetch=async (url,options) => {
   if(String(url).includes('/api/bridge')){
      const elapsed=window.__clock;
      const measured=elapsed === null ? 0 : Date.now()-900;
      return {ok:true,json:async()=>({state:{updatedAt:Date.now(),decks:{
        left:{title:'モニタリング',artist:'DECO*27',elapsed,clockObservedAt:measured,playing:'playing'},
        right:{title:'曲2',artist:'作者2',elapsed:null,clockObservedAt:0,playing:'unknown'}
      }}})};
   }
   return {ok:false,json:async()=>({error:'not configured'})};
 };}''')
 page.evaluate('async(url)=>await import(url)',as_data(app))
 page.locator('[data-tab="settings"]').click()
 page.locator('#setting-token').fill('fake-token-do-not-use')
 page.locator('#setting-bridge').check()
 page.locator('#save-settings').click()
 page.locator('[data-tab="live"]').click()
 page.wait_for_function("document.getElementById('elapsed-left').textContent !== '--:--'",timeout=8000)
 t1=page.locator('#elapsed-left').inner_text()
 assert t1.startswith('00:3'),t1
 assert page.locator('#elapsed-right').inner_text()=='--:--'
 page.evaluate('window.__clock=57.3')
 page.wait_for_function("document.getElementById('elapsed-left').textContent.startsWith('00:5')",timeout=9000)
 page.evaluate('window.__clock=null')
 page.wait_for_function("document.getElementById('elapsed-left').textContent==='--:--'",timeout=9000)
 assert not errors,errors
 print('PASS: Web bridge clock 32s -> 57s -> unreadable, no JS errors')
 browser.close()

"""Reproduce blocked IFrame API and confirm direct official iframe fallback + retry.
No YouTube content fetched in this test.
"""
from playwright.sync_api import sync_playwright
from browser_preview_smoke import script,bundled,FAKE_YT

def run():
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':1440,'height':900})
  ctx.route('**/iframe_api',lambda r:r.abort())
  ctx.route('**/embed/**',lambda r:r.abort())
  page=ctx.new_page()
  errs=[]
  page.on('pageerror',lambda e:errs.append(str(e)))
  script(page,'output.html')
  page.add_script_tag(content=bundled('output.js')+'\nwindow.__testTake=take;')
  page.wait_for_function('document.querySelector("#output-issue-title").textContent.includes("YT_SCRIPT_ERROR")',timeout=6000)
  assert 'ブロック' in page.locator('#output-issue-detail').inner_text()
  page.evaluate('window.__testTake({title:"テスト",artist:"テストP",videoId:"M7lc1UVf-VE",startSeconds:12})')
  page.wait_for_function('document.querySelector("#output-player iframe")!==null',timeout=3500)
  iframe=page.locator('#output-player iframe')
  assert 'youtube.com/embed/M7lc1UVf-VE' in iframe.get_attribute('src')
  assert 'start=12' in iframe.get_attribute('src')
  assert '自動同期' in page.locator('#output-issue-detail').inner_text()
  assert page.locator('body.has-output-diagnostic').count()==1
  # Browser fake SDK should be usable after clicking retry, even after rejection.
  page.evaluate(FAKE_YT)
  page.get_by_role('button',name='YouTube接続を再試行').click()
  page.wait_for_function('document.querySelector("#output-player iframe[data-fake-yt]")!==null',timeout=5000)
  page.wait_for_function('document.querySelector("#output-diagnostic").hidden===true',timeout=4000)
  assert errs==[],errs
  print('PASS: network script blocked => error code => official embed fallback => SDK retry')

  # DJ LIVE previews also get an official iframe fallback when SDK init fails.
  app=ctx.new_page()
  script(app,'index.html')
  app.add_script_tag(content=bundled('app.js'))
  app.get_by_role('button',name='MV検索・管理').click()
  app.locator('#search-title').fill('曲')
  app.locator('#search-artist').fill('アーティスト')
  app.locator('#apply-track').click()
  app.locator('#manual-url').fill('M7lc1UVf-VE')
  app.locator('#apply-manual-video').click()
  app.get_by_role('button',name='DJ LIVE').click()
  app.locator('[data-take="left"]').click()
  app.wait_for_function('document.querySelector("#main-player iframe")!==null',timeout=8000)
  assert '同期は利用できません' in app.locator('#preview-diagnostic').inner_text()
  browser.close()
  print('PASS: main DJ LIVE fallback and explicit sync limitation')

if __name__=='__main__':run()

from playwright.sync_api import sync_playwright
from browser_preview_smoke import script,bundled,FAKE_YT

def run():
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':1420,'height':920})
  page=ctx.new_page(); errs=[];page.on('pageerror', lambda e:errs.append(str(e)))
  script(page,'index.html');page.evaluate(FAKE_YT);page.add_script_tag(content=bundled('app.js'))
  # No empty video ID players should be created on page open.
  page.wait_for_timeout(300)
  assert page.evaluate('(window.__ytPlayers||[]).length')==0
  page.get_by_role('button',name='MV検索・管理').click()
  page.locator('#search-title').fill('曲'); page.locator('#search-artist').fill('作曲者')
  page.locator('#apply-track').click()
  page.locator('#manual-url').fill('M7lc1UVf-VE')
  page.locator('#apply-manual-video').click()
  page.wait_for_function('(window.__ytPlayers||[]).length>=1',timeout=4000)
  page.get_by_role('button',name='DJ LIVE').click();page.locator('[data-take="left"]').click()
  page.wait_for_function('document.querySelector("#main-player>iframe[data-fake-yt]")!==null',timeout=5000)
  page.wait_for_function('document.querySelector("#preview-diagnostic").textContent.includes("再生中")',timeout=5000)
  assert page.evaluate('(window.__ytPlayers||[]).every(p=>p._id==="M7lc1UVf-VE")')
  assert not errs,errs
  print('PASS: lazy player loads only selected video and can play TAKE')

  output=ctx.new_page();script(output,'output.html');output.evaluate(FAKE_YT);output.add_script_tag(content=bundled('output.js')+'\nwindow.__testTake=take;')
  output.wait_for_timeout(400)
  assert output.evaluate('(window.__ytPlayers||[]).length')==0
  output.evaluate('window.__testTake({title:"曲",artist:"作曲者",videoId:"M7lc1UVf-VE",startSeconds:34})')
  output.wait_for_function('document.querySelector("#output-player>iframe[data-fake-yt]")!==null',timeout=5000)
  output.wait_for_function('document.querySelector("#output-diagnostic").hidden===true',timeout=5000)
  assert output.evaluate('window.__ytPlayers[0]._time')==34
  print('PASS: output player created after TAKE, starts at requested time')

  # Block script; should retry and fall back to autoplay=1/mute=1 without pretending sync works.
  blocked=ctx.new_page(); blocked.route('**/iframe_api',lambda r:r.abort());blocked.route('**/embed/**',lambda r:r.abort())
  script(blocked,'output.html');blocked.add_script_tag(content=bundled('output.js')+'\nwindow.__testTake=take;')
  blocked.evaluate('window.__testTake({title:"曲",artist:"作曲者",videoId:"M7lc1UVf-VE",startSeconds:8})')
  blocked.wait_for_function('document.querySelector("#output-player iframe")!==null',timeout=6000)
  src=blocked.locator('#output-player iframe').get_attribute('src')
  assert 'autoplay=1' in src and 'mute=1' in src and 'start=8' in src, src
  assert '同期' in blocked.locator('#output-issue-detail').inner_text()
  print('PASS: unavailable SDK => muted autoplay attempt and explicit no-sync')
  browser.close()

if __name__=='__main__':run()

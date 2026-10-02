const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};
  const server=http.createServer((req,res)=>{
    let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`,url=base+'/pet/';
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
    const errors=[],external=[];
    async function context(){
      const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
      await c.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){external.push(route.request().url());return route.abort()}return route.continue()});
      c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(7000)});return c;
    }
    const first=await context(),page=await first.newPage();
    await page.goto(url);await page.locator('#adopt').click();await page.locator('#dialog').waitFor({state:'hidden'});
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('brickTownPetLocalV1')));
    assert.equal((await saved()).pet.points,0);
    await page.locator('#parentPoints').click();await page.locator('#parentPin').fill('724681');await page.locator('#confirmPin').fill('724681');await page.locator('#awardSubmit').click();
    await page.locator('#awardTask').waitFor();await page.locator('#parentPin').fill('000000');await page.locator('#awardSubmit').click();
    await page.locator('#parentError').filter({hasText:'家长密码不对'}).waitFor();assert.equal((await saved()).pet.points,0);
    await page.locator('#parentPin').fill('724681');await page.locator('#awardSubmit').click();await page.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#points').innerText(),'20');
    await first.setOffline(true);
    await page.locator('#feed').click();await page.locator('[data-food=apple]').click();await page.locator('#dialog').waitFor({state:'hidden'});
    assert.equal((await saved()).pet.points,15,'feeding and saving work fully offline');
    await page.locator('#rename').click();await page.locator('#nameInput').fill('小火狐');await page.locator('#renameForm button').click();await page.locator('#dialog').waitFor({state:'hidden'});
    await first.setOffline(false);await page.reload();await page.locator('#petName').filter({hasText:'小火狐'}).waitFor();
    assert.equal(await page.locator('#points').innerText(),'15','reload keeps offline progress');
    await page.locator('#bath').click();await page.locator('#confirmExchange').click();await page.locator('.bubble').first().waitFor();
    assert.equal((await saved()).pet.points,7);await page.reload();await page.locator('#resumeActivity').click();
    // Bubbles intentionally float continuously: click their current position without waiting for stillness.
    while(await page.locator('.bubble').count())await page.locator('.bubble').first().click({force:true});
    await page.locator('#resumeActivity').waitFor({state:'hidden'});assert.equal((await saved()).pet.points,7,'resume does not debit twice');
    await page.locator('#shareTop').click();const backup=await page.locator('#backupCode').inputValue();assert(backup.startsWith('FOX1.'));
    assert.equal(await page.locator('#shareLink').inputValue(),'https://hugfeature.github.io/brick-town/pet/');
    const second=await context(),other=await second.newPage();
    await other.goto(url+'#home='+'a'.repeat(48));await other.locator('#adopt').click();await other.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await other.locator('#points').innerText(),'0','another browser starts independently even with an old family link');
    assert.equal(await other.locator('#petName').innerText(),'团团');
    assert.equal(new URL(other.url()).hash,'','old family tokens do not remain in sharing links');
    await other.locator('#openFamilyFooter').click();await other.locator('#homeLink').fill('FOX1.broken');await other.locator('#joinForm button').click();
    await other.locator('#joinError').filter({hasText:'不完整'}).waitFor();assert.equal(await other.locator('#points').innerText(),'0');
    await other.locator('#homeLink').fill(backup);await other.locator('#joinForm button').click();await other.locator('#confirmImport').check();await other.locator('#importSubmit').click();await other.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await other.locator('#petName').innerText(),'小火狐');assert.equal(await other.locator('#points').innerText(),'7');
    await other.locator('#parentPoints').click();await other.locator('#awardTask').selectOption('reading');await other.locator('#parentPin').fill('724681');await other.locator('#awardSubmit').click();await other.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await other.locator('#points').innerText(),'17');assert.equal((await saved()).pet.points,7,'imported copy is independent');
    // Storage failures must not change balance or show a successful save.
    await other.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}});
    await other.locator('#feed').click();await other.locator('[data-food=apple]').click();await other.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await other.locator('#points').innerText(),'17');assert.match(await other.locator('#saveStatus').innerText(),/没有保存/);
    assert.equal(await other.locator('#connectionPanel').isVisible(),true);
    const denied=await context();await denied.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}}));
    const deniedPage=await denied.newPage();await deniedPage.goto(url);await deniedPage.locator('#connectionTitle').filter({hasText:'需要处理'}).waitFor();
    await page.locator('#closeDialog').click();
    for(const width of [320,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width)}
    if(process.env.QA_SHOTS){fs.mkdirSync(process.env.QA_SHOTS,{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.QA_SHOTS,'pet-local-mobile.png'),fullPage:true});await page.locator('#shareTop').click();await page.screenshot({path:path.join(process.env.QA_SHOTS,'pet-local-backup.png')});}
    assert.deepEqual(external,[],'no third-party or cloud request in the entire flow');assert.deepEqual(errors,[]);
    console.log('PASS: browser adoption, parent confirmation, offline care, refresh recovery, paid activity resume, isolated phones, backup transfer, local write errors, denied storage, phone layout, no external requests.');
  }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});

// Exercise the child's mission and persistent rewards through real browser controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html;charset=utf-8');r.end(fs.readFileSync(path.join(__dirname,'../index.html')))});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}:{})});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{let t=0,q=[];performance.now=()=>t;requestAnimationFrame=f=>{q.push(f);return q.length};cancelAnimationFrame=()=>{};window.advance=ms=>{while(ms>0){const step=Math.min(ms,40);ms-=step;t+=step;const run=q;q=[];run.forEach(f=>f(t))}};window.speechSynthesis=undefined});
 const url=`http://127.0.0.1:${server.address().port}`,advance=ms=>p.evaluate(ms=>advance(ms),ms),saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('brickTownRacerV1')));
 await p.goto(url);await p.locator('#listenTask').click();assert(await p.locator('#start').isVisible());await p.locator('#start').click();await advance(10000);assert((await p.locator('#missionHud').innerText()).includes('1/3'));assert.equal((await saved()).rewardPending,false,'reward before delivery');
 // Deliberately miss the remaining fruit. The orchard must retain the first apple.
 await p.keyboard.down('ArrowRight');await advance(1000);await p.keyboard.up('ArrowRight');await advance(120000);assert(await p.locator('#continuePicnic').isVisible());assert((await p.locator('#veil').innerText()).includes('已经找到 1'));
 await p.locator('#continuePicnic').click();assert((await p.locator('#missionHud').innerText()).includes('1/3'));await advance(30000);assert.equal(await p.locator('[data-reward]').count(),3);assert((await p.locator('#missionHud').innerText()).includes('3/3'));assert.equal((await saved()).owned.length,0);
 await p.locator('#rewardLater').click();await p.reload();await p.locator('#pendingReward').click();await p.locator('[data-reward="rainbow"]').click();assert.equal((await saved()).decoration,'rainbow');assert.deepEqual((await saved()).owned,['rainbow']);assert.equal((await saved()).rewardPending,false);
 await p.locator('#backGarage').click();await p.reload();await p.locator('#settings').click();assert(await p.locator('#modal [data-decoration="rainbow"]').getAttribute('aria-pressed')==='true');assert(await p.locator('#modal [data-decoration="star"]').isDisabled());await p.locator('#closeModal').click();
 // A fresh full trip also delivers normally, without the orchard.
 await p.locator('#start').click();await advance(125000);assert.equal(await p.locator('[data-reward]').count(),3);await p.locator('[data-reward="bear"]').click();await p.locator('#wearAndDrive').click();await advance(4000);assert.equal((await saved()).mode,'cruise');assert(await p.locator('#missionHud').isHidden());
 // Old saves retain paint/track and gain safe defaults for the new fields.
 await p.evaluate(()=>localStorage.setItem('brickTownRacerV1',JSON.stringify({track:1,difficulty:0,color:2,sound:false,best:{'1-0':8}})));await p.reload();assert(await p.locator('#start').isVisible());await p.locator('#settings').click();assert(await p.locator('#modal [data-color="2"]').getAttribute('aria-pressed')==='true');assert(await p.locator('#modal [data-decoration="bear"]').isDisabled());
 assert.deepEqual(errors,[]);console.log('PASS: narration fallback, delivery gate, missed fruit and orchard continuation, three reward choices, pending recovery, equipped persistence, locked cosmetics, direct completion, cruise mode and legacy save migration.');
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

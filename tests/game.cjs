// Browser regression checks. No production-only test hooks are used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(source)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}: {})});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let clock=0,queue=[];performance.now=()=>clock;
  window.requestAnimationFrame=fn=>{queue.push(fn);return queue.length};
  window.cancelAnimationFrame=()=>{};
  window.advance=ms=>{for(let remaining=ms;remaining>0;){let step=Math.min(40,remaining);clock+=step;remaining-=step;const q=queue;queue=[];q.forEach(fn=>fn(clock))}};
 });
 const url=`http://127.0.0.1:${server.address().port}`;
 const advance=ms=>page.evaluate(ms=>window.advance(ms),ms);
 const meters=async()=>Number((await page.locator('#distance').innerText()).split('/')[0].trim());
 const carX=()=>page.evaluate(()=>{const c=document.getElementById('game'),ctx=c.getContext('2d'),w=c.width,h=c.height;const pix=ctx.getImageData(0,Math.floor(h*.73),w,Math.floor(h*.12)).data;let sum=0,n=0;for(let i=0;i<pix.length;i+=4)if(pix[i]>200&&pix[i+1]>65&&pix[i+1]<145&&pix[i+2]<110){sum+=(i/4)%w;n++}return n?sum/n:NaN});
 async function load(){await page.goto(url);if(process.env.QA_FONT_CSS){await page.addStyleTag({content:fs.readFileSync(process.env.QA_FONT_CSS,'utf8')});await page.evaluate(()=>document.fonts.ready)} }
 await load();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile horizontal overflow');
 for(const id of ['left','right']){const b=await page.locator('#'+id).boundingBox();assert(b.height>=64&&b.y+b.height<=844,'touch button outside viewport')}
 if(process.env.QA_SHOTS)await page.screenshot({path:path.join(process.env.QA_SHOTS,'racer-ready.png')});
 await page.locator('#start').click();await advance(3400);
 const initial=await carX();
 // Native touch events exercise actual pointer capture, not synthetic element handlers.
 const cdp=await page.context().newCDPSession(page);const box=await page.locator('#right').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await advance(280);
 const turned=await carX();assert(turned>initial+25,'right touch did not steer');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(280);assert(Math.abs(await carX()-turned)<5,'steering stuck after release');
 await page.keyboard.down('ArrowLeft');await advance(280);await page.keyboard.up('ArrowLeft');assert(await carX()<turned-25,'keyboard left did not steer');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await advance(160);const beforeCancel=await carX();await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advance(160);assert(Math.abs(await carX()-beforeCancel)<5,'steering stuck after touch cancel');await page.keyboard.down('ArrowLeft');await advance(160);await page.keyboard.up('ArrowLeft');
 await page.locator('#pause').click();const paused=await meters();await advance(5000);assert.equal(await meters(),paused,'paused race moved');
 await page.locator('#resume').click();await advance(4000);assert(await meters()>paused,'resume failed');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert(await page.locator('#resume').isVisible(),'blur did not pause');await page.locator('#resume').click();
 if(process.env.QA_SHOTS)await page.screenshot({path:path.join(process.env.QA_SHOTS,'racer-mobile.png')});
 await advance(105000);assert(await page.locator('#again').isVisible(),'forest race did not finish');
 assert(Number((await page.locator('#stars').innerText()).replace(/\D/g,''))>0,'stars not collected');
 assert((await page.locator('#veil').innerText()).includes('下次试试'),'center-lane obstacle did not produce collision feedback');
 await page.locator('#again').click();await advance(3400);assert(await meters()<5,'restart retained distance');assert((await page.locator('#stars').innerText()).startsWith('0'),'restart retained stars');
 await page.locator('#pause').click();await page.locator('#garage').click();
 // Remaining tracks and both driving modes must complete.
 for(const track of [1,2]){await page.locator('#settings').click();await page.locator(`#modal [data-track="${track}"]`).click();await page.locator('#modal [data-difficulty="1"]').click();await page.locator('#closeModal').click();await page.locator('#start').click();await advance(115000);assert(await page.locator('#again').isVisible(),`track ${track} did not finish`);await page.locator('#backGarage').click()}
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('brickTownRacerV1')));assert.equal(Object.keys(saved.best).length,3);
 await page.reload();assert((await page.locator('#hudTrack').innerText()).includes('落日'),'preferences not restored');
 if(process.env.QA_FONT_CSS){await page.addStyleTag({content:fs.readFileSync(process.env.QA_FONT_CSS,'utf8')});await page.evaluate(()=>document.fonts.ready)}
 await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'desktop overflow');
 if(process.env.QA_SHOTS){await page.locator('#start').click();await advance(12500);await page.screenshot({path:path.join(process.env.QA_SHOTS,'racer-desktop.png')})}
 await page.evaluate(()=>localStorage.setItem('brickTownRacerV1','{broken'));await page.reload();assert(await page.locator('#start').isVisible(),'corrupt save blocked startup');
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile layout, native touch steering/release/cancel, keyboard, pause/resume, blur pause, all three finishes, star collection, collision recovery, restart, persistence, corrupt save, no browser errors.');
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

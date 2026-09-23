// Real-clock startup tests: animation-clock mocks previously missed old WebViews.
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
  for(const profile of ['standard','legacy-canvas','low-frame-rate']){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(profile=>{
    if(profile==='legacy-canvas'){
     CanvasRenderingContext2D.prototype.roundRect=undefined;
     window.ResizeObserver=undefined;
    }
    if(profile==='low-frame-rate'){
     const nativeRAF=window.requestAnimationFrame.bind(window);
     window.requestAnimationFrame=callback=>setTimeout(()=>nativeRAF(callback),250);
     window.cancelAnimationFrame=id=>clearTimeout(id);
    }
   },profile);
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.locator('#start').click();
   await page.waitForFunction(()=>document.getElementById('veil').hidden,{},{timeout:5500});
   await page.waitForFunction(()=>parseFloat(document.getElementById('distance').textContent)>0,{},{timeout:5000});
   assert.deepEqual(errors,[],profile+' browser errors');
   assert.equal(await page.locator('#pause').isEnabled(),true,profile+' never entered racing');
   await page.locator('#pause').click();
   assert(await page.locator('#resume').isVisible(),profile+' pause unavailable');
   if(profile==='legacy-canvas'){
    await page.locator('#garage').click();
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.getElementById('veil').hidden,{},{timeout:5500});
    assert.deepEqual(errors,[],'legacy restart errors');
   }
   await page.close();console.log('PASS: real-clock countdown, movement and pause: '+profile);
  }
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

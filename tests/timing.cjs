// Regression for frame-rate-dependent slow motion; also bounds UI update churn.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const source=fs.readFileSync(process.env.RACER_TEST_SOURCE||path.join(__dirname,'../index.html'),'utf8');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(source)});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}: {})});
 const measurements=[];
 for(const fps of [60,15,5]){
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{
   let time=0,frames=[];performance.now=()=>time;requestAnimationFrame=f=>{frames.push(f);return frames.length};cancelAnimationFrame=()=>{};
   window.advance=(ms,fps)=>{let remaining=ms;while(remaining>1e-7){const step=Math.min(1000/fps,remaining);time+=step;remaining-=step;const run=frames;frames=[];run.forEach(f=>f(time))}};
   window.fillCount=0;const fill=CanvasRenderingContext2D.prototype.fill;CanvasRenderingContext2D.prototype.fill=function(...args){window.fillCount++;return fill.apply(this,args)};
  });
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.locator('#start').click();await p.evaluate(fps=>advance(4000,fps),fps);
  const before=Number((await p.locator('#distance').innerText()).split('/')[0]);
  const metrics=await p.evaluate(async fps=>{
   let changes=0;const observer=new MutationObserver(r=>changes+=r.length);observer.observe(document.querySelector('.hud'),{subtree:true,childList:true,characterData:true,attributes:true});fillCount=0;advance(4000,fps);await Promise.resolve();observer.disconnect();const c=document.getElementById('game');return{changes,fills:fillCount,pixels:c.width*c.height};
  },fps);
  const after=Number((await p.locator('#distance').innerText()).split('/')[0]);measurements.push({fps,meters:after-before,...metrics});assert.deepEqual(errors,[]);await p.close();
 }
 console.log(JSON.stringify(measurements));
 if(!process.env.RACER_MEASURE_ONLY){
  const ref=measurements[0].meters;assert(ref>=110,'cruise speed was not increased');
  for(const m of measurements){assert(Math.abs(m.meters-ref)<=3,`slow motion at ${m.fps} FPS`);assert(m.changes<180,'HUD DOM churn');assert(m.pixels<500000,'mobile canvas resolution too expensive')}
  console.log('PASS: 5/15/60 FPS travel within 3m over 4s; faster cruise, bounded HUD writes and mobile canvas pixels.');
 }
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

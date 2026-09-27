import {freshPet,normalizePet,energyNow} from './state.mjs';

const $=id=>document.getElementById(id);
const API_ORIGIN='https://little-fox-playhouse.tuned-rat-6518.chatgpt.site';
const API_URL=(location.hostname==='terminal.local'||location.origin===API_ORIGIN?'':API_ORIGIN)+'/api/pet';
const TOKEN_KEY='brickTownPetFamilyV1';
const SOUND_KEY='brickTownPetSoundV1';
const tokenPattern=/^[a-f0-9]{48}$/;
const dialog=$('dialog');
let pet=freshPet(),revision=0,token='',ready=false,busy=false,syncing=false,mode='',sound=false,audio=null;
let bubbleCount=0,bathComplete=false,round=0,target=0,answered=false,gameComplete=false,petTapped=0,lastFocus=null;
let pending=null;
const colors=[{name:'红色',color:'#d95e59'},{name:'蓝色',color:'#4687cd'},{name:'黄色',color:'#b58a12'}];
function randomKey(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('')}
function requestId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
function remember(){try{localStorage.setItem(TOKEN_KEY,token)}catch{}history.replaceState(null,'','#home='+token)}
function familyURL(){return 'https://hugfeature.github.io/brick-town/pet/#home='+token}
function say(text){$('speech').textContent=text}
function status(text,error=false){$('saveStatus').textContent=text;$('saveStatus').classList.toggle('saved-error',error)}
function setState(data){if(data&&Number.isSafeInteger(data.revision)&&data.revision>=revision){pet=normalizePet(data.pet);revision=data.revision;render()}}
function render(){
  $('petName').textContent=pet.name;document.title=pet.name+'的小窝 · 积木小镇';
  for(const key of ['food','clean','joy','energy']){const value=key==='energy'?energyNow(pet):pet[key];$(key+'Value').textContent=value;$(key+'Bar').value=value}
  document.querySelector('.playhouse').classList.toggle('night',pet.sleeping);
  $('roomState').textContent=pet.sleeping?'☾ 睡着啦':'☀ 醒着呢';
  $('sleepMark').hidden=!pet.sleeping;$('sleepIcon').textContent=pet.sleeping?'☀️':'🌙';
  $('sleepLabel').textContent=pet.sleeping?'起床啦':'睡一会';$('sleepHint').textContent=pet.sleeping?'轻轻叫醒它':'充充小电池';
  for(const id of ['feed','bath','play','pet']) $(id).disabled=!ready||busy||pet.sleeping||mode==='bath';
  $('sleep').disabled=!ready||busy||mode==='bath';$('rename').disabled=!ready||busy;$('share').disabled=!token;
  $('sceneHint').textContent=mode==='bath'?`还剩 ${bubbleCount} 个泡泡，点一点`:(pet.sleeping?'可以关掉网页，让团团安心休息':'轻轻点一点，'+pet.name+'会很开心');
  $('careCount').textContent=pet.care;
  $('bondTitle').textContent=pet.care<4?'刚认识的好朋友':pet.care<12?'越来越有默契':'最亲密的小伙伴';
  $('bondMessage').textContent=pet.care>=12?'和你在一起，就很开心。':'每一次陪伴，都算数。';
  $('bondHearts').replaceChildren(...Array.from({length:5},(_,i)=>{const span=document.createElement('span');span.textContent='♥';if(i<Math.min(5,Math.ceil(pet.care/3)))span.className='filled';return span}));
  $('bondHearts').setAttribute('aria-label',`已获得 ${Math.min(5,Math.ceil(pet.care/3))} 颗陪伴爱心`);
  document.querySelectorAll('[data-sticker]').forEach(el=>{const done=pet.stickers.includes(el.dataset.sticker);el.classList.toggle('earned',done);el.querySelector('small').textContent=done?'一起完成啦':'还没试过'});
}
async function api(method='GET',body){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(API_URL,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal,credentials:'omit'});
    let data;try{data=await response.json()}catch{throw new Error('云端还没连上，请稍后点“重新连接”。')}
    if(!response.ok){const e=new Error(data.error||'暂时没连上云端');e.status=response.status;e.data=data;throw e}return data;
  }finally{clearTimeout(timer)}
}
async function refresh(manual=false){
  if(!token||busy||syncing)return;syncing=true;
  if(manual)status('正在同步…');
  try{
    const before=revision;const data=await api();setState(data);ready=true;status('☁ 已同步到云端');
    if(manual)say(pet.sleeping?'嘘，'+pet.name+'正在做美梦。':before&&revision>before?'家人刚刚照顾过我，已经同步啦！':'小窝同步好了，一起玩吧。');
  }catch(e){ready=false;status('连接中断 · 点这里重连',true);if(manual)say(e.message);}
  finally{syncing=false;render()}
}
async function act(action,value){
  if(busy||!ready)return false;busy=true;render();status('正在保存…');
  const body={action,value,revision,requestId:requestId()};pending=body;
  try{
    const data=await api('POST',body);setState(data);pending=null;status('☁ 已保存到云端');return true;
  }catch(e){
    if(e.status===409){setState(e.data);pending=null;status('☁ 已同步家人的操作');say(e.message)}
    else{ready=false;status('保存未确认 · 点这里重连',true);say('网络暂时断开了，先重新连接小窝。')}
    return false;
  }finally{busy=false;render()}
}
async function reconnect(){
  if(!token){welcome();return}
  // Retry only this exact last request: requestId + revision prevent duplicate/overwriting progress.
  if(pending&&!busy){busy=true;render();status('正在确认上次保存…');try{const d=await api('POST',pending);setState(d);pending=null;ready=true;status('☁ 已保存到云端');say('小窝连接好啦！')}catch(e){if(e.status===409){setState(e.data);pending=null;ready=true;status('☁ 已同步家人的操作');say(e.message)}else{say(e.message);status('连接失败 · 点这里重试',true)}}finally{busy=false;render()}}else await refresh(true);
}
function chime(notes=[523,659,784]){
  if(!sound||document.hidden)return;
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});notes.forEach((frequency,i)=>{const o=audio.createOscillator(),g=audio.createGain(),at=audio.currentTime+i*.10;o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.07,at+.015);g.gain.exponentialRampToValueAtTime(.001,at+.23);o.connect(g);g.connect(audio.destination);o.start(at);o.stop(at+.24)})}catch{sound=false;updateSound()}
}
function celebrate(symbol='💛'){
  $('pet').classList.remove('pop');void $('pet').offsetWidth;$('pet').classList.add('pop');
  for(let i=0;i<5;i++){const el=document.createElement('span');el.className='particle';el.textContent=symbol;el.style.setProperty('--x',(18+i*14)+'%');el.style.animationDelay=i*.06+'s';$('effects').append(el);setTimeout(()=>el.remove(),1500)}chime();
}
function openDialog(html){lastFocus=document.activeElement;$('dialogContent').innerHTML=html;if(!dialog.open)dialog.showModal()}
function closeDialog(){if(busy)return;dialog.close();mode='';render();lastFocus?.focus()}
$('closeDialog').onclick=closeDialog;
dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
dialog.addEventListener('close',()=>{if(mode==='game')mode='';render()});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}});
function welcome(message='给团团一个家，开始一起玩吧。'){
  openDialog('<div class="dialog-icon">🦊</div><h2 id="dialogTitle">认识一下，我是团团</h2><p id="welcomeMessage"></p><button class="primary" id="adopt">领养团团</button><button class="rest-button" id="joinHome">已经有小窝？打开家庭链接</button>');
  $('welcomeMessage').textContent=message;
  $('adopt').onclick=async()=>{
    if(busy)return;busy=true;$('adopt').disabled=true;$('adopt').textContent='正在准备小窝…';
    if(!token){token=randomKey();remember()}
    pending={action:'adopt',requestId:requestId()};
    try{const data=await api('POST',pending);setState(data);ready=true;pending=null;status('☁ 小窝已保存到云端');busy=false;closeDialog();say('你好呀！我是'+pet.name+'，来抱一下。');celebrate('✨')}
    catch(e){$('welcomeMessage').textContent=e.message;$('adopt').textContent='再试一次';$('adopt').disabled=false}
    finally{busy=false;render()}
  };
  $('joinHome').onclick=joinDialog;
}
function joinDialog(){
  openDialog('<div class="dialog-icon">🏡</div><h2 id="dialogTitle">回到同一个小窝</h2><p>把家人发来的完整家庭链接粘贴到这里。</p><form id="joinForm" class="rename-form"><label for="homeLink">家庭链接</label><input id="homeLink" autocomplete="off" placeholder="https://…/#home=…" required><p id="joinError" class="error-note"></p><button class="primary">打开小窝</button></form>');
  $('joinForm').onsubmit=async e=>{e.preventDefault();if(busy)return;const match=$('homeLink').value.trim().match(/#home=([a-f0-9]{48})$/);if(!match){$('joinError').textContent='链接不完整，请重新复制家人发来的链接。';return}busy=true;const old=token;token=match[1];try{const d=await api();revision=0;setState(d);ready=true;remember();pending=null;status('☁ 已同步到云端');busy=false;closeDialog();say('你回来啦！')}catch(err){token=old;$('joinError').textContent=err.message}finally{busy=false;render()}};
}
$('feed').onclick=()=>{
  openDialog('<div class="dialog-icon">🍽️</div><h2 id="dialogTitle">今天吃点什么？</h2><p>选一个，喂给小狐狸。</p><div class="food-options"><button class="food-option" data-food="apple"><span>🍎</span>小苹果</button><button class="food-option" data-food="carrot"><span>🥕</span>胡萝卜</button><button class="food-option" data-food="fish"><span>🐟</span>小鱼干</button></div>');
  document.querySelectorAll('[data-food]').forEach(b=>b.onclick=async()=>{if(busy||!ready)return;document.querySelectorAll('[data-food]').forEach(x=>x.disabled=true);const ok=await act('feed',b.dataset.food);closeDialog();if(ok){say(pet.food>=95?'肚子饱饱的，谢谢你！':'啊呜，好好吃呀！');celebrate(b.querySelector('span').textContent)}});
};
function cancelBath(){mode='';$('bubbles').hidden=true;$('bubbles').replaceChildren();$('cancelBath').hidden=true;document.querySelector('.playhouse').classList.remove('bath-mode');render()}
$('cancelBath').onclick=()=>{cancelBath();say('我们等会儿再洗，也可以。')};
$('bath').onclick=()=>{
  if(!ready||busy)return;mode='bath';bubbleCount=5;bathComplete=false;$('bubbles').hidden=false;$('cancelBath').hidden=false;document.querySelector('.playhouse').classList.add('bath-mode');say('把 5 个小泡泡点掉，洗香香！');
  [[14,18],[65,17],[36,40],[9,66],[70,64]].forEach(([x,y],i)=>{const b=document.createElement('button');b.className='bubble';b.setAttribute('aria-label','小泡泡 '+(i+1));b.textContent='✧';b.style.left=x+'%';b.style.top=y+'%';b.style.setProperty('--delay',i*.17+'s');b.onclick=async()=>{if(b.disabled||bathComplete)return;b.disabled=true;b.remove();bubbleCount--;chime([650+i*70]);render();if(!bubbleCount){bathComplete=true;const ok=await act('bath');cancelBath();if(ok){say('洗得干干净净，香香的！');celebrate('🫧')}}};$('bubbles').append(b)});render();
};
$('pet').onclick=async()=>{if(Date.now()-petTapped<1000)return;petTapped=Date.now();if(await act('pet')){say(['嘿嘿，有一点点痒！','最喜欢你的抱抱了。','和你在一起真开心！'][Math.floor(Math.random()*3)]);celebrate()}};
$('sleep').onclick=async()=>{const waking=pet.sleeping;if(await act(waking?'wake':'sleep')){say(waking?'早安！想和我做点什么？':'晚安，睡醒了再一起玩。');if(waking)celebrate('☀️');else chime([392,330,262])}};
function showRound(){
  target=Math.floor(Math.random()*3);answered=false;
  const order=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
  openDialog('<div class="dialog-icon">🎨</div><h2 id="dialogTitle">一起找颜色</h2><div class="round-count">'+Array.from({length:3},(_,i)=>i<round?'★':'☆').join(' ')+'</div><p>请点一下 <b class="target-color" style="background:'+colors[target].color+'">'+colors[target].name+'</b></p><div class="color-options">'+order.map(i=>'<button class="color-choice" style="background:'+colors[i].color+'" data-color="'+i+'" aria-label="'+colors[i].name+'色块">'+colors[i].name+'</button>').join('')+'</div><p id="gameFeedback" class="game-feedback" role="status">慢慢找，不用抢时间。</p>');
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{if(answered||busy)return;if(Number(b.dataset.color)!==target){$('gameFeedback').textContent='这是'+colors[Number(b.dataset.color)].name+'，再找找'+colors[target].name+'吧。';chime([392]);return}answered=true;round++;chime();$('gameFeedback').textContent='找对啦！';document.querySelectorAll('[data-color]').forEach(x=>x.disabled=true);const next=document.createElement('button');next.className='primary';next.textContent=round===3?'完成啦，抱抱团团':'下一个颜色';next.onclick=round===3?finishGame:showRound;$('dialogContent').append(next)});
}
async function finishGame(){if(gameComplete||busy)return;gameComplete=true;const ok=await act('play');if(!ok){closeDialog();return}openDialog('<div class="game-finish">🌈</div><h2 id="dialogTitle">三个颜色，都找到啦！</h2><p>谢谢你陪我玩，真开心。<br>也找找身边相同颜色的东西吧。</p><button class="primary" id="finishGame">回到小窝</button>');$('finishGame').onclick=()=>{closeDialog();say('你观察得好仔细，我好开心！');celebrate('🌈')};}
$('play').onclick=()=>{mode='game';round=0;gameComplete=false;showRound()};
$('rename').onclick=()=>{
  openDialog('<div class="dialog-icon">✏️</div><h2 id="dialogTitle">给小狐狸起个名字</h2><form id="renameForm" class="rename-form"><label for="nameInput">名字（最多 8 个字）</label><input id="nameInput" maxlength="16" required autocomplete="off"><p id="nameError" class="error-note"></p><button class="primary">就叫这个名字</button></form>');$('nameInput').value=pet.name;
  $('renameForm').onsubmit=async e=>{e.preventDefault();const value=$('nameInput').value.trim();if(!value||Array.from(value).length>8){$('nameError').textContent='起一个 1 到 8 个字的名字吧。';return}if(await act('rename',value)){closeDialog();say('好呀，以后我就叫'+pet.name+'啦！')}};
};
function updateSound(){$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭声音':'打开声音');$('sound').querySelector('span').textContent=sound?'声音开':'声音关';try{localStorage.setItem(SOUND_KEY,String(sound))}catch{}}
$('sound').onclick=()=>{sound=!sound;updateSound();if(sound)chime();else audio?.suspend().catch(()=>{})};
$('share').onclick=()=>{
  if(!token)return;
  openDialog('<div class="dialog-icon">🏡</div><h2 id="dialogTitle">换手机，也在同一个家</h2><p>把这个链接发给家人，在另一部手机打开，就能接着玩。</p><div class="rename-form"><label for="shareLink">家庭专属链接</label><input id="shareLink" readonly><button class="primary" id="copyLink">复制家庭链接</button></div><p id="copyStatus" class="share-note">拿到链接的人都能照顾这只宠物，只发给家人哦。</p>');$('shareLink').value=familyURL();$('shareLink').onclick=()=>{$('shareLink').select()};$('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(familyURL());$('copyStatus').textContent='复制好了，发给家人或保存到收藏吧。'}catch{$('shareLink').focus();$('shareLink').select();$('copyStatus').textContent='请长按上面的链接，选择“复制”。'}};
};
$('parents').onclick=()=>{
  openDialog('<div class="dialog-icon">🌱</div><h2 id="dialogTitle">给爸爸妈妈</h2><p class="parent-copy">适合约 <b>5～7 岁</b>孩子独立点按，也可以陪低龄孩子一起体验。找颜色提供观察练习，照顾宠物提供表达关心的机会，不是能力测评。</p><p class="parent-copy">没有广告、付费、签到或死亡惩罚。离开时不会扣状态，睡觉能恢复精神，随时可以结束。</p><p class="parent-copy">进度保存在云端。<b>换手机请打开同一个家庭链接</b>，不要重新领养。两台手机一起玩时会同步，网络中断会暂停修改。请收藏家庭链接，丢失后不能凭名字找回。</p><button class="primary" id="parentsDone">知道了，回到小窝</button>');$('parentsDone').onclick=closeDialog;
};
$('sync').onclick=reconnect;
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)audio?.suspend().catch(()=>{});else if(!pending)refresh();});
window.addEventListener('online',()=>{reconnect()});window.addEventListener('offline',()=>{ready=false;render();status('离线了 · 连网后接着玩',true)});
window.addEventListener('hashchange',()=>{location.reload()});
setInterval(()=>{if(!document.hidden&&!pending)refresh()},15000);
setInterval(()=>{if(pet.sleeping&&!document.hidden){$('energyValue').textContent=energyNow(pet);$('energyBar').value=energyNow(pet)}},1000);
$('pet').querySelector('img').addEventListener('error',e=>{e.target.hidden=true;$('pet').querySelector('.pet-fallback').hidden=false});
async function init(){
  try{sound=localStorage.getItem(SOUND_KEY)==='true'}catch{}updateSound();
  const match=location.hash.match(/^#home=([a-f0-9]{48})$/);
  if(match)token=match[1];else if(!location.hash){try{const stored=localStorage.getItem(TOKEN_KEY);if(tokenPattern.test(stored||''))token=stored}catch{}}
  render();
  if(token){remember();await refresh(true);if(!ready){say('还没连接到小窝，点下方“重连”再试。');status('小窝未连接 · 点这里重连',true)}}
  else{status('领养后自动保存到云端');welcome(location.hash?'家庭链接不完整，请让家人重新发一次。':'给团团一个家，开始一起玩吧。')}
}
init();

// Optional browser-agent status tool; no family key is exposed.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 try{Promise.resolve(document.modelContext.registerTool({name:'get_pet_status',title:'查看宠物状态',description:'Read this family pet’s currently displayed state and cloud connection, without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({pet:{...pet,energy:energyNow(pet)},revision,connected:ready,saving:busy})},{signal:lifecycle.signal})).catch(()=>{})}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

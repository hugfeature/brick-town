import {freshPet,normalizePet,energyNow} from './state.mjs';
import {RULES,TASKS,taskState} from './rules.mjs';
import {LocalPetStore,SAVE_KEY,decodeBackup} from './local-store.mjs';

const $=id=>document.getElementById(id);
const store=new LocalPetStore();
const PUBLIC_PAGE='https://hugfeature.github.io/brick-town/pet/';
const SOUND_KEY='brickTownPetSoundV1';
const dialog=$('dialog');
let pet=freshPet(),revision=0,ready=false,busy=false,mode='',sound=false,audio=null;
let bubbleCount=0,bathComplete=false,round=0,target=0,answered=false,gameComplete=false,petTapped=0,lastFocus=null;
let toastTimer,saveError='',rewardMessage='',activeActivityId='';
const colors=[{name:'红色',color:'#d95e59'},{name:'蓝色',color:'#4687cd'},{name:'黄色',color:'#b58a12'}];
function say(text){$('speech').textContent=text}
function status(text,error=false){$('saveStatus').textContent=text;$('saveStatus').classList.toggle('saved-error',error)}
function setState(data){if(data&&Number.isSafeInteger(data.revision)&&data.revision>=1){pet=normalizePet(data.pet);revision=data.revision;render()}}
function renderConnection(){
  $('connectionPanel').hidden=ready&&!saveError;
  $('connectionTitle').textContent=saveError?'本机存档需要处理':'在这台设备上，养自己的小狐狸';
  $('connectionDetail').textContent=saveError||'进度自动保存在当前浏览器。别人打开链接，会有自己的小窝。';
  $('reconnectNow').textContent=busy?'正在保存…':revision?'重新读取存档':'领养小狐狸';
  $('reconnectNow').disabled=busy;$('openFamily').disabled=busy;$('openFamilyFooter').disabled=busy;
}
function render(){
  renderConnection();
  $('petName').textContent=pet.name;document.title=pet.name+'的小窝 · 积木小镇';
  for(const key of ['food','clean','joy','energy']){const value=key==='energy'?energyNow(pet):pet[key];$(key+'Value').textContent=revision?value:'—';$(key+'Bar').value=value}
  document.querySelector('.playhouse').classList.toggle('night',pet.sleeping);
  $('roomState').textContent=pet.sleeping?'☾ 睡着啦':'☀ 醒着呢';
  $('sleepMark').hidden=!pet.sleeping;$('sleepIcon').textContent=pet.sleeping?'☀️':'🌙';
  $('sleepLabel').textContent=pet.sleeping?'起床啦':'睡一会';$('sleepHint').textContent=pet.sleeping?'轻轻叫醒它':'充充小电池';
  for(const id of ['feed','bath','play','pet','count','memory','dance']) $(id).disabled=!ready||busy||pet.sleeping||mode==='bath';
  $('sleep').disabled=!ready||busy||mode==='bath';$('rename').disabled=!ready||busy;$('share').disabled=busy;$('shareTop').disabled=busy;
  $('sceneHint').textContent=mode==='bath'?`还剩 ${bubbleCount} 个泡泡，点一点`:(pet.sleeping?'可以关掉网页，让团团安心休息':'轻轻点一点，'+pet.name+'会很开心');
  $('parentPoints').disabled=!ready||busy;
  const today=taskState(pet);
  $('points').textContent=pet.points;
  $('earnedTotal').textContent='家长累计奖励 '+pet.totalPoints+' 分';
  $('dailyCount').textContent=today.done.length+' / '+Object.keys(TASKS).length;
  $('dailyMessage').textContent='完成后请爸爸妈妈确认，积分才会到账。';
  $('dailyTasks').replaceChildren(...Object.entries(TASKS).map(([key,task])=>{const el=document.createElement('div');const done=today.done.includes(key);el.className=done?'done':'';el.textContent=(done?'✓ ':task.icon+' ')+task.label+' · '+(done?'已奖励': '+'+task.points+' 分');return el}));
  document.querySelectorAll('[data-reward]').forEach(el=>{const rule=RULES[el.dataset.reward];el.textContent=rule.cost+' 分兑换';});
  $('sleepHint').textContent='免费休息';
  $('resumeActivity').hidden=!pet.activity;$('resumeActivity').disabled=!ready||busy||pet.sleeping||mode==='bath';
  if(pet.activity)$('resumeActivity').textContent='继续'+RULES[pet.activity.action].label+' · 已兑换，不再扣分';
  $('careCount').textContent=pet.care;
  $('bondTitle').textContent=pet.care<4?'刚认识的好朋友':pet.care<12?'越来越有默契':'最亲密的小伙伴';
  $('bondMessage').textContent=pet.care>=12?'和你在一起，就很开心。':'每一次陪伴，都算数。';
  $('bondHearts').replaceChildren(...Array.from({length:5},(_,i)=>{const span=document.createElement('span');span.textContent='♥';if(i<Math.min(5,Math.ceil(pet.care/3)))span.className='filled';return span}));
  $('bondHearts').setAttribute('aria-label',`已获得 ${Math.min(5,Math.ceil(pet.care/3))} 颗陪伴爱心`);
  document.querySelectorAll('[data-sticker]').forEach(el=>{const done=pet.stickers.includes(el.dataset.sticker);el.classList.toggle('earned',done);el.querySelector('small').textContent=done?'一起完成啦':'还没试过'});
}
function refreshLocal(manual=false){
  if(busy)return;
  try{
    const data=store.read();saveError='';ready=!!data;
    if(data)setState(data);else{revision=0;pet=freshPet()}
    status(data?'✓ 已保存在这台设备':'领养后自动保存在本机');
    if(manual){if(data)say('小窝在这台设备上保存好了。');else welcome()}
  }catch(e){saveError=e.message;ready=false;status('本机存档未能读取',true);if(manual)say(e.message)}
  render();
}
async function act(action,value,pin){
  if(busy||!ready)return false;busy=true;render();status('正在保存到本机…');
  const before=pet.points;
  try{
    setState(await store.act(action,value,pin,revision));saveError='';status('✓ 已保存在这台设备');
    rewardMessage='';const delta=pet.points-before;if(delta!==0){rewardMessage=delta>0?'⭐ 家长奖励 +'+delta+' 分':'已兑换，使用 '+(-delta)+' 分';showReward(rewardMessage)}return true;
  }catch(e){
    if(e.data)setState(e.data);
    if(e.status===507){ready=false;saveError=e.message;status('本次操作没有保存',true)}
    else if(e.status===404){ready=false;status('还没有本机存档',true)}
    else status('✓ 已保存在这台设备');
    say(e.message);showReward(e.message);return false;
  }finally{busy=false;render()}
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
dialog.addEventListener('close',()=>{document.querySelectorAll('input[type=password]').forEach(x=>x.value='');if(mode==='game')mode='';render()});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}});
function welcome(message='给团团一个家吧。进度自动保存在这台设备的当前浏览器里。'){
  openDialog('<div class="dialog-icon">🦊</div><h2 id="dialogTitle">认识一下，我是团团</h2><p id="welcomeMessage"></p><button class="primary" id="adopt">领养团团</button><button class="rest-button" id="joinHome">有备份？导入存档</button>');
  $('welcomeMessage').textContent=message;
  $('adopt').onclick=async()=>{
    if(busy)return;busy=true;$('adopt').disabled=true;$('adopt').textContent='正在准备小窝…';
    try{setState(await store.adopt());ready=true;saveError='';status('✓ 已保存在这台设备');busy=false;closeDialog();say('你好呀！我是'+pet.name+'，来抱一下。');celebrate('✨')}
    catch(e){saveError=e.message;$('welcomeMessage').textContent=e.message;$('adopt').textContent='再试一次';$('adopt').disabled=false}
    finally{busy=false;render()}
  };
  $('joinHome').onclick=joinDialog;
}
function joinDialog(){
  openDialog('<div class="dialog-icon">📥</div><h2 id="dialogTitle">导入小窝存档</h2><p>在原设备“备份 / 换手机”中复制最新存档码，粘贴到这里。导入后两台设备各自保存，不会自动同步。</p><form id="joinForm" class="rename-form"><label for="homeLink">完整存档码（FOX1. 开头）</label><textarea id="homeLink" rows="4" autocomplete="off" spellcheck="false" required></textarea><p id="joinError" class="error-note" role="status"></p><button class="primary">查看这份存档</button></form>');
  $('joinForm').onsubmit=e=>{
    e.preventDefault();if(busy)return;
    const code=$('homeLink').value;
    let imported;try{imported=decodeBackup(code)}catch(err){$('joinError').textContent=err.message;return}
    let expected=revision;const needsPin=pet.parentConfigured&&revision>0;
    openDialog('<div class="dialog-icon">📥</div><h2 id="dialogTitle">确认导入存档</h2><p id="importSummary"></p><p>导入后使用备份中的家长密码。存档只包含备份那一刻的进度。</p><form id="importForm" class="rename-form">'+(revision?'<label class="import-check"><input id="confirmImport" type="checkbox" required>用这份备份替换本机现有的小窝</label>':'')+(needsPin?'<label for="importPin">当前小窝的 6 位家长密码</label><input id="importPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off">':'')+'<p id="importError" class="error-note" role="status"></p><button class="primary" id="importSubmit">确认导入</button><button class="rest-button" type="button" id="cancelImport">先不导入</button></form>');
    $('importSummary').textContent=imported.pet.name+' · '+imported.pet.points+' 积分 · 备份时间 '+new Date(imported.savedAt).toLocaleString('zh-CN');
    $('cancelImport').onclick=closeDialog;
    $('importForm').onsubmit=async event=>{
      event.preventDefault();if(busy)return;busy=true;$('importSubmit').disabled=true;
      try{
        const data=await store.importBackup(code,$('importPin')?.value,expected);setState(data);ready=true;saveError='';busy=false;cancelBath();closeDialog();status('✓ 存档已导入这台设备');say('你回来啦！进度已保存在这台设备。');
      }catch(err){if(err.data){setState(err.data);expected=revision}if(err.status===409&&$('confirmImport'))$('confirmImport').checked=false;$('importError').textContent=err.message;if($('importPin'))$('importPin').value='';$('importSubmit').disabled=false}
      finally{busy=false;render()}
    };
  };
}
$('feed').onclick=()=>{
  openDialog('<div class="dialog-icon">🍽️</div><h2 id="dialogTitle">今天吃点什么？</h2><p id="feedMessage">每份需要 '+RULES.feed.cost+' 分，选好食物后扣分。<br>现在有 '+pet.points+' 分。</p><div class="food-options"><button class="food-option" data-food="apple"><span>🍎</span>小苹果</button><button class="food-option" data-food="carrot"><span>🥕</span>胡萝卜</button><button class="food-option" data-food="fish"><span>🐟</span>小鱼干</button></div>');
  document.querySelectorAll('[data-food]').forEach(b=>b.onclick=async()=>{if(busy||!ready)return;if(pet.points<RULES.feed.cost){$('feedMessage').textContent='积分还不够，请爸爸妈妈确认任务后发积分。';return}document.querySelectorAll('[data-food]').forEach(x=>x.disabled=true);const ok=await act('feed',b.dataset.food);closeDialog();if(ok){say(pet.food>=95?'肚子饱饱的，谢谢你！':'啊呜，好好吃呀！');celebrate(b.querySelector('span').textContent)}});
};
function cancelBath(){mode='';$('bubbles').hidden=true;$('bubbles').replaceChildren();$('cancelBath').hidden=true;document.querySelector('.playhouse').classList.remove('bath-mode');render()}
$('cancelBath').onclick=()=>{cancelBath();say('我们等会儿再洗，也可以。')};
$('bath').onclick=()=>{
  if(!ready||busy)return;mode='bath';bubbleCount=5;bathComplete=false;$('bubbles').hidden=false;$('cancelBath').hidden=false;document.querySelector('.playhouse').classList.add('bath-mode');say('把 5 个小泡泡点掉，洗香香！');
  [[14,18],[65,17],[36,40],[9,66],[70,64]].forEach(([x,y],i)=>{const b=document.createElement('button');b.className='bubble';b.setAttribute('aria-label','小泡泡 '+(i+1));b.textContent='✧';b.style.left=x+'%';b.style.top=y+'%';b.style.setProperty('--delay',i*.17+'s');b.onclick=async()=>{if(b.disabled||bathComplete)return;b.disabled=true;b.remove();bubbleCount--;chime([650+i*70]);render();if(!bubbleCount){bathComplete=true;const ok=await completeActivity();cancelBath();if(ok){say('洗得干干净净，香香的！');celebrate('🫧')}}};$('bubbles').append(b)});render();
};
$('pet').onclick=async()=>{if(Date.now()-petTapped<1000)return;petTapped=Date.now();if(await act('pet')){say(['嘿嘿，有一点点痒！','最喜欢你的抱抱了。','和你在一起真开心！'][Math.floor(Math.random()*3)]);celebrate()}};
$('sleep').onclick=async()=>{const waking=pet.sleeping;if(await act(waking?'wake':'sleep')){say(waking?'早安！想和我做点什么？':'晚安，睡醒了再一起玩。');if(waking)celebrate('☀️');else chime([392,330,262])}};
function showRound(){
  target=Math.floor(Math.random()*3);answered=false;
  const order=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
  openDialog('<div class="dialog-icon">🎨</div><h2 id="dialogTitle">一起找颜色</h2><div class="round-count">'+Array.from({length:3},(_,i)=>i<round?'★':'☆').join(' ')+'</div><p>请点一下 <b class="target-color" style="background:'+colors[target].color+'">'+colors[target].name+'</b></p><div class="color-options">'+order.map(i=>'<button class="color-choice" style="background:'+colors[i].color+'" data-color="'+i+'" aria-label="'+colors[i].name+'色块">'+colors[i].name+'</button>').join('')+'</div><p id="gameFeedback" class="game-feedback" role="status">慢慢找，不用抢时间。</p>');
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{if(answered||busy)return;if(Number(b.dataset.color)!==target){$('gameFeedback').textContent='这是'+colors[Number(b.dataset.color)].name+'，再找找'+colors[target].name+'吧。';chime([392]);return}answered=true;round++;chime();$('gameFeedback').textContent='找对啦！';document.querySelectorAll('[data-color]').forEach(x=>x.disabled=true);const next=document.createElement('button');next.className='primary';next.textContent=round===3?'完成啦，抱抱团团':'下一个颜色';next.onclick=round===3?finishGame:showRound;$('dialogContent').append(next)});
}
async function finishGame(){if(gameComplete||busy)return;gameComplete=true;if(!await completeActivity()){closeDialog();return}openDialog('<div class="game-finish">🌈</div><h2 id="dialogTitle">三个颜色，都找到啦！</h2><p>谢谢你陪我玩，真开心。<br>也找找身边相同颜色的东西吧。</p><p class="reward-result" id="gameReward"></p><button class="primary" id="finishGame">回到小窝</button>');$('gameReward').textContent='本次互动已兑换，不会再次扣分。';$('finishGame').onclick=()=>{closeDialog();say('你观察得好仔细，我好开心！');celebrate('🌈')};}
$('play').onclick=()=>{mode='game';round=0;gameComplete=false;showRound()};
$('rename').onclick=()=>{
  openDialog('<div class="dialog-icon">✏️</div><h2 id="dialogTitle">给小狐狸起个名字</h2><form id="renameForm" class="rename-form"><label for="nameInput">名字（最多 8 个字）</label><input id="nameInput" maxlength="16" required autocomplete="off"><p id="nameError" class="error-note"></p><button class="primary">就叫这个名字</button></form>');$('nameInput').value=pet.name;
  $('renameForm').onsubmit=async e=>{e.preventDefault();const value=$('nameInput').value.trim();if(!value||Array.from(value).length>8){$('nameError').textContent='起一个 1 到 8 个字的名字吧。';return}if(await act('rename',value)){closeDialog();say('好呀，以后我就叫'+pet.name+'啦！')}};
};
function updateSound(){$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭声音':'打开声音');$('sound').querySelector('span').textContent=sound?'声音开':'声音关';try{localStorage.setItem(SOUND_KEY,String(sound))}catch{}}
$('sound').onclick=()=>{sound=!sound;updateSound();if(sound)chime();else audio?.suspend().catch(()=>{})};
function shareHome(){
  let code='';try{if(revision)code=store.exportBackup()}catch(e){say(e.message)}
  openDialog('<div class="dialog-icon">💾</div><h2 id="dialogTitle">备份 / 换手机</h2><p>小窝只保存在当前浏览器。清除网站数据或使用无痕模式，可能丢失进度；请把备份存到自己的备忘录。</p>'+(code?'<div class="rename-form"><label for="backupCode">当前进度的存档码</label><textarea id="backupCode" rows="3" readonly spellcheck="false"></textarea><button class="primary" id="copyBackup">复制存档码</button><button class="rest-button" id="downloadBackup">下载存档文件</button></div>':'<p>领养后，就可以备份这台设备的进度。</p>')+'<p id="copyStatus" class="share-note" role="status">换手机后点“导入存档”，粘贴最新存档码即可。两边之后各自保存。</p><button class="rest-button" id="importBackup">导入已有存档</button><div class="public-share"><b>分享给朋友，养各自的小狐狸</b><p>这个链接不包含你的进度。</p><input id="shareLink" aria-label="游戏分享链接" readonly><button class="rest-button" id="copyPublic">复制游戏链接</button></div>');
  $('shareLink').value=PUBLIC_PAGE;$('shareLink').onclick=()=>{$('shareLink').select()};
  if(code){
    $('backupCode').value=code;$('backupCode').onclick=()=>{$('backupCode').select()};
    $('copyBackup').onclick=async()=>{try{await navigator.clipboard.writeText(code);$('copyStatus').textContent='存档码已复制。请保存到备忘录，或发给需要接着玩的家人。'}catch{$('backupCode').focus();$('backupCode').select();$('copyStatus').textContent='请长按存档码，选择“复制”。'}};
    $('downloadBackup').onclick=()=>{const url=URL.createObjectURL(new Blob([code],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='little-fox-save.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('copyStatus').textContent='存档已导出。换手机时打开文件，复制全部内容并导入。'};
  }
  $('importBackup').onclick=joinDialog;
  $('copyPublic').onclick=async()=>{try{await navigator.clipboard.writeText(PUBLIC_PAGE);$('copyStatus').textContent='游戏链接已复制，朋友可以养自己的小狐狸。'}catch{$('shareLink').focus();$('shareLink').select();$('copyStatus').textContent='请长按游戏链接，选择“复制”。'}};
}
$('share').onclick=shareHome;$('shareTop').onclick=shareHome;
$('parents').onclick=()=>{
  openDialog('<div class="dialog-icon">🌱</div><h2 id="dialogTitle">给爸爸妈妈</h2><p class="parent-copy">适合约 <b>5～7 岁</b>孩子独立点按，也可以陪低龄孩子一起体验。找颜色提供观察练习，照顾宠物提供表达关心的机会，数星星和配对也可以慢慢尝试，不是能力测评。</p><p class="parent-copy">没有广告、付费、签到或死亡惩罚。完成现实中的任务后，由家长输入密码发积分；孩子用积分兑换互动，不花真钱。摸摸、睡觉和叫醒免费。请由家长先在这台设备上设置密码，再交给孩子玩。离开时不会扣状态，睡觉能恢复精神，随时可以结束。</p><p class="parent-copy">进度保存在<b>这台设备的当前浏览器</b>，别人打开链接会有自己的小窝。页面加载后，暂时断网也能玩和保存；重新打开页面仍需要能访问游戏网址。请使用普通浏览模式，不要清除网站数据。换手机可在“备份 / 换手机”中复制存档码，再手动导入；之后不会自动同步。</p><button class="primary" id="parentsDone">知道了，回到小窝</button>');$('parentsDone').onclick=closeDialog;
};
$('sync').onclick=()=>refreshLocal(true);$('reconnectNow').onclick=()=>refreshLocal(true);
$('openFamily').onclick=joinDialog;$('openFamilyFooter').onclick=joinDialog;
setInterval(()=>{if(!document.hidden)render()},60000);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)audio?.suspend().catch(()=>{});else if(!busy)refreshLocal()});
window.addEventListener('storage',event=>{if((event.key===SAVE_KEY||event.key===null)&&!busy)refreshLocal()});
setInterval(()=>{if(pet.sleeping&&!document.hidden){$('energyValue').textContent=energyNow(pet);$('energyBar').value=energyNow(pet)}},1000);
$('pet').querySelector('img').addEventListener('error',e=>{e.target.hidden=true;$('pet').querySelector('.pet-fallback').hidden=false});
function init(){
  try{sound=localStorage.getItem(SOUND_KEY)==='true'}catch{}updateSound();
  const legacyLink=location.hash.startsWith('#home=');
  if(legacyLink)history.replaceState(null,'',location.pathname+location.search);
  refreshLocal();
  if(!revision&&!saveError)welcome(legacyLink?'现在每台设备各自养小狐狸，旧版云端进度不会自动迁入。可以在这里领养新的团团，或导入本机版备份。':undefined);
}
init();

// Read-only browser-agent tool never exposes the parent PIN verifier.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 try{Promise.resolve(document.modelContext.registerTool({name:'get_pet_status',title:'查看宠物状态',description:'Read this browser’s local pet progress, without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({pet:{...pet,energy:energyNow(pet)},revision,localSaveReady:ready,saving:busy})},{signal:lifecycle.signal})).catch(()=>{})}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

function showReward(message){
  clearTimeout(toastTimer);$('rewardToast').textContent=message;$('rewardToast').hidden=false;
  toastTimer=setTimeout(()=>{$('rewardToast').hidden=true},4200);
}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function finishActivity(action,title,icon){
  if(gameComplete||busy)return;gameComplete=true;
  if(!await completeActivity()){closeDialog();return}
  openDialog('<div class="game-finish">'+icon+'</div><h2 id="dialogTitle">'+title+'</h2><p class="reward-result" id="activityReward"></p><p>谢谢你陪我玩！休息一下也很好。</p><button class="primary" id="activityDone">回到小窝</button>');
  $('activityReward').textContent='本次互动已兑换，不会再次扣分。';
  $('activityDone').onclick=()=>{closeDialog();say('有你陪我，真开心！');celebrate(icon)};
}
$('count').onclick=()=>{
  mode='game';gameComplete=false;let completed=0;
  function next(){
    const n=1+Math.floor(Math.random()*5);let locked=false;
    openDialog('<div class="dialog-icon">⭐</div><h2 id="dialogTitle">一共有几颗星星？</h2><p>第 '+(completed+1)+' / 3 题 · 一颗一颗慢慢数</p><div class="count-stars" aria-label="'+n+' 颗星星">'+Array(n).fill('<span aria-hidden="true">⭐</span>').join('')+'</div><div class="number-options">'+[1,2,3,4,5].map(x=>'<button class="number-choice" data-number="'+x+'">'+x+'</button>').join('')+'</div><p id="countFeedback" class="game-feedback" role="status">数好了，点下面的数字。</p>');
    document.querySelectorAll('[data-number]').forEach(b=>b.onclick=()=>{
      if(locked||busy)return;
      if(Number(b.dataset.number)!==n){$('countFeedback').textContent='再数一遍吧，不着急。';return}
      locked=true;completed++;chime();$('countFeedback').textContent='对啦，一共 '+n+' 颗！';
      document.querySelectorAll('[data-number]').forEach(x=>x.disabled=true);
      const button=document.createElement('button');button.className='primary';button.textContent=completed===3?'完成啦':'再数一次';button.onclick=completed===3?()=>finishActivity('count','三次数数，都完成啦！','⭐'):next;$('dialogContent').append(button);
    });
  }next();
};
$('memory').onclick=()=>{
  mode='game';gameComplete=false;const cards=shuffle(['🍎','🍎','🌼','🌼','🐟','🐟']);let selected=[],pairs=0,locked=false;
  openDialog('<div class="dialog-icon">🃏</div><h2 id="dialogTitle">找出一样的好朋友</h2><p>翻开两张卡，找到 3 对。没有次数限制。</p><div class="memory-grid">'+cards.map((_,i)=>'<button class="memory-card" data-card="'+i+'" aria-label="翻开第 '+(i+1)+' 张卡">?</button>').join('')+'</div><p id="memoryFeedback" class="game-feedback" role="status">先选一张吧。</p><button class="primary" id="memoryNext" hidden>盖好，再找一对</button>');
  const buttons=[...document.querySelectorAll('[data-card]')];
  buttons.forEach((b,i)=>b.onclick=()=>{
    if(locked||selected.includes(i)||b.disabled)return;
    b.textContent=cards[i];b.setAttribute('aria-label','第 '+(i+1)+' 张：'+cards[i]);b.classList.add('revealed');selected.push(i);
    if(selected.length<2){$('memoryFeedback').textContent='再选一张，找一样的。';return}
    if(cards[selected[0]]===cards[selected[1]]){
      selected.forEach(x=>{buttons[x].disabled=true;buttons[x].classList.add('matched')});pairs++;selected=[];chime();$('memoryFeedback').textContent='找到 '+pairs+' / 3 对啦！';
      if(pairs===3){locked=true;$('memoryNext').hidden=false;$('memoryNext').textContent='配对完成啦';$('memoryNext').onclick=()=>finishActivity('memory','三对好朋友，都找到啦！','🌼')}
    }else{
      locked=true;$('memoryFeedback').textContent='不一样，记住它们的位置再试试。';$('memoryNext').hidden=false;
      $('memoryNext').onclick=()=>{selected.forEach(x=>{buttons[x].textContent='?';buttons[x].classList.remove('revealed');buttons[x].setAttribute('aria-label','翻开第 '+(x+1)+' 张卡')});selected=[];locked=false;$('memoryNext').hidden=true;$('memoryFeedback').textContent='再找一对吧。'};
    }
  });
};
$('dance').onclick=()=>{
  mode='game';gameComplete=false;let step=0;const moves=shuffle([{icon:'👏',label:'拍拍手'},{icon:'🙌',label:'举高手'},{icon:'👋',label:'挥挥手'}]);
  function next(){
    const move=moves[step];let locked=false;
    openDialog('<div class="dialog-icon">🎵</div><h2 id="dialogTitle">跟团团跳个舞</h2><p>第 '+(step+1)+' / 3 步 · 找到“'+move.label+'”</p><div class="dance-cue" aria-hidden="true">'+move.icon+'</div><div class="dance-options">'+shuffle(moves).map(m=>'<button class="dance-choice" data-move="'+m.label+'"><span>'+m.icon+'</span>'+m.label+'</button>').join('')+'</div><p id="danceFeedback" class="game-feedback" role="status">点相同的动作，也可以一起动一动。</p>');
    document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{if(locked)return;if(b.dataset.move!==move.label){$('danceFeedback').textContent='看看上面的动作，再试一次。';return}locked=true;step++;chime();document.querySelectorAll('[data-move]').forEach(x=>x.disabled=true);$('danceFeedback').textContent='跟上啦！';const button=document.createElement('button');button.className='primary';button.textContent=step===3?'跳完啦':'下一个动作';button.onclick=step===3?()=>finishActivity('dance','小小舞蹈完成啦！','🎵'):next;$('dialogContent').append(button)});
  }next();
};
$('rules').onclick=()=>{
  openDialog('<div class="dialog-icon">⭐</div><h2 id="dialogTitle">先完成任务，再兑换陪伴</h2><p>当前是试行规则，之后可以按你家的约定调整。</p><h3>做完任务，家长确认后得分</h3><div class="rules-list">'+Object.values(TASKS).map(task=>'<div><span>'+task.icon+' '+task.label+'</span><b>+'+task.points+' 分</b><small>每项每天确认一次</small></div>').join('')+'</div><h3>攒下积分，兑换宠物互动</h3><div class="rules-list">'+Object.values(RULES).map(rule=>'<div><span>'+rule.icon+' '+rule.label+'</span><b>'+rule.cost+' 分 / 次</b></div>').join('')+'</div><p class="parent-copy">游戏不会产生积分。家长也可以自定义奖励原因和分值。摸摸、睡觉、叫醒和改名免费。游戏和洗澡在确认兑换时扣分，中途退出可免费继续；喂食在选择食物时扣分。</p><p class="parent-copy">任务按北京时间零点重新开始，已有积分一直保留。积分不足不能兑换，不会欠分，也不会让宠物生病或消失。</p><button class="primary" id="rulesDone">知道啦</button>');$('rulesDone').onclick=closeDialog;
};
$('history').onclick=()=>{
  openDialog('<div class="dialog-icon">📒</div><h2 id="dialogTitle">我的积分记录</h2><p>最近 12 条 · 现在可用 '+pet.points+' 分</p><div id="ledger" class="ledger"></div><button class="primary" id="historyDone">回到小窝</button>');
  if(!pet.ledger.length){const text=document.createElement('p');text.textContent='完成一件小事，就会记在这里。';$('ledger').append(text)}
  pet.ledger.forEach(item=>{const row=document.createElement('div'),label=document.createElement('span'),amount=document.createElement('b'),time=document.createElement('small');label.textContent=item.label;amount.textContent=(item.amount>0?'+':'')+item.amount+' 分';time.textContent=new Date(item.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});row.append(label,amount,time);$('ledger').append(row)});$('historyDone').onclick=closeDialog;
};

function parentDialog(){
  if(!ready)return;
  const setup=!pet.parentConfigured;
  openDialog('<div class="dialog-icon">🔐</div><h2 id="dialogTitle">'+(setup?'先设置家长密码':'家长确认 · 发积分')+'</h2><p>'+(setup?'请由爸爸妈妈设置 6 位数字密码，发积分时需要使用。请记好，暂不支持找回。':'确认孩子完成任务后，再发积分。')+'</p><form id="parentForm" class="rename-form">'+(setup?'':'<label for="awardTask">完成的任务</label><select id="awardTask">'+Object.entries(TASKS).map(([key,task])=>'<option value="'+key+'" '+(taskState(pet).done.includes(key)?'disabled':'')+'>'+task.label+' +'+task.points+' 分'+(taskState(pet).done.includes(key)?'（今日已发）':'')+'</option>').join('')+'<option value="custom">自定义奖励</option></select><div id="customAward" hidden><label for="awardReason">奖励原因（最多 20 字）</label><input id="awardReason" maxlength="20" placeholder="例如：整理好书包"><label for="awardPoints">奖励多少分（1～500）</label><input id="awardPoints" type="number" min="1" max="500" value="10"></div>')+'<label for="parentPin">'+(setup?'设置':'输入')+' 6 位家长密码</label><input id="parentPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required>'+(setup?'<label for="confirmPin">再输入一次</label><input id="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required>':'')+'<p id="parentError" class="error-note" role="status"></p><button class="primary" id="awardSubmit">'+(setup?'保存家长密码':'确认完成，发放积分')+'</button></form>');
  if(!setup){const update=()=>{$('customAward').hidden=$('awardTask').value!=='custom';$('awardReason').required=$('awardTask').value==='custom';$('awardPoints').required=$('awardTask').value==='custom'};$('awardTask').onchange=update;update();}
  $('parentForm').onsubmit=async e=>{
    e.preventDefault();if(busy||!ready)return;
    const pin=$('parentPin').value;
    if(!/^\d{6}$/.test(pin)){$('parentError').textContent='请输入 6 位数字。';return}
    if(setup&&pin!==$('confirmPin').value){$('parentError').textContent='两次密码不同，请检查一下。';return}
    const value=setup?undefined:{task:$('awardTask').value,...($('awardTask').value==='custom'?{reason:$('awardReason').value.trim(),points:Number($('awardPoints').value)}:{})};
    $('awardSubmit').disabled=true;
    const ok=await act(setup?'parentSetup':'parentAward',value,pin);
    if(ok){if(setup){parentDialog();$('parentError').textContent='密码设置好了，现在可以确认任务、发积分。'}else{closeDialog();say('收到爸爸妈妈的奖励啦！选一个喜欢的互动吧。');celebrate('⭐')}}
    else if($('parentError')){$('parentError').textContent=$('speech').textContent;$('parentPin').value='';$('awardSubmit').disabled=false;}
  };
}
$('parentPoints').onclick=parentDialog;
async function completeActivity(){if(!pet.activity||pet.activity.id!==activeActivityId){showReward('当前互动已经变化，请回到小窝再点继续。');return false}return act('finish',activeActivityId)}
const activityStarts={};
$('resumeActivity').onclick=()=>{if(pet.activity&&ready&&!busy&&!pet.sleeping){activeActivityId=pet.activity.id;activityStarts[pet.activity.action]()}};
// Charge once before starting paid activities. Completion and canceled rounds never mint points.
for(const action of ['bath','play','count','memory','dance']){
  const begin=$(action).onclick;activityStarts[action]=begin;
  $(action).onclick=()=>{
    const rule=RULES[action];
    if(pet.activity){showReward('还有一个已兑换的互动，点“继续”就能玩，不再扣分。');return}
    if(pet.points<rule.cost){openDialog('<div class="dialog-icon">⭐</div><h2 id="dialogTitle">再攒一点积分吧</h2><p>这个互动需要 '+rule.cost+' 分，现在有 '+pet.points+' 分。完成任务后，请爸爸妈妈确认发分。</p><p>也可以先摸摸团团，或让它休息一会。</p><button class="primary" id="notEnoughDone">知道啦</button>');$('notEnoughDone').onclick=closeDialog;return}
    openDialog('<div class="dialog-icon">'+rule.icon+'</div><h2 id="dialogTitle">用 '+rule.cost+' 分兑换'+rule.label+'？</h2><p>现在有 '+pet.points+' 分，兑换后剩 '+(pet.points-rule.cost)+' 分。<br>确认后开始互动；退出后可点“继续”接着玩，不再扣分。</p><button class="primary" id="confirmExchange">确认兑换，开始玩</button><button class="rest-button" id="cancelExchange">先不兑换</button>');
    $('cancelExchange').onclick=closeDialog;
    $('confirmExchange').onclick=async()=>{if(busy||!ready)return;$('confirmExchange').disabled=true;if(await act(action)){activeActivityId=pet.activity.id;closeDialog();begin()}else closeDialog()};
  };
}

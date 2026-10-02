import {freshPet,normalizePet,changePet,grantPoints} from './state.mjs';

export const SAVE_KEY='brickTownPetLocalV1';
export const PREVIOUS_KEY=SAVE_KEY+'Previous';
const FORMAT='brick-town-pet',MAX_BYTES=50000;
const browserStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
const error=(message,status=400,data)=>Object.assign(new Error(message),{status,data});
const storageError=()=>error('浏览器没有保存成功。请允许网站保存数据，或先导出已有存档；不要清除网站数据。',507);
const publicRecord=record=>record?{pet:{...normalizePet(record.pet),parentConfigured:!!record.pet._parent},revision:record.revision}:null;
const copy=value=>JSON.parse(JSON.stringify(value));

function validateRecord(record){
  const fail=()=>{throw error('存档不完整或版本不支持，请使用从“备份 / 换手机”导出的完整存档。')};
  if(!record||record.format!==FORMAT||record.version!==1||!Number.isSafeInteger(record.revision)||record.revision<1||!Number.isSafeInteger(record.savedAt))fail();
  const p=record.pet;
  if(!p||typeof p.name!=='string'||!p.name.trim()||Array.from(p.name.trim()).length>8||/[\u0000-\u001f\u007f]/.test(p.name))fail();
  for(const key of ['food','clean','joy','energy'])if(!Number.isInteger(p[key])||p[key]<0||p[key]>100)fail();
  for(const key of ['care','points','totalPoints','sleepStarted'])if(!Number.isSafeInteger(p[key])||p[key]<0)fail();
  if(p.points>1000000000||p.totalPoints>1000000000||p.care>1000000||typeof p.sleeping!=='boolean'||!Array.isArray(p.stickers)||!Array.isArray(p.ledger)||!p.tasks||!Array.isArray(p.tasks.done))fail();
  if(p.activity&&(!['bath','play','count','memory','dance'].includes(p.activity.action)||!/^[a-f0-9-]{20,64}$/.test(p.activity.id||'')))fail();
  const auth=p._parent;
  if(auth&&(!/^[a-f0-9-]{32,64}$/.test(auth.salt||'')||!/^[a-f0-9]{64}$/.test(auth.hash||'')||!Number.isInteger(auth.failures)||auth.failures<0||!Number.isSafeInteger(auth.lockedUntil)||auth.lockedUntil<0))fail();
  if(p.parentConfigured&&!auth)fail();
  return {...record,pet:{...normalizePet(p),parentConfigured:!!auth,...(auth?{_parent:{salt:auth.salt,hash:auth.hash,failures:auth.failures,lockedUntil:auth.lockedUntil}}:{})}};
}
function parseRecord(raw){
  if(typeof raw!=='string'||raw.length>MAX_BYTES)throw error('存档太长或格式不正确。');
  let record;try{record=JSON.parse(raw)}catch{throw error('存档内容不完整，请重新复制。')}
  return validateRecord(record);
}
export function decodeBackup(text){
  if(typeof text!=='string'||text.length>MAX_BYTES*2)throw error('存档太长或格式不正确。');
  let raw=text.trim();
  if(raw.startsWith('FOX1.')){
    try{raw=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(raw.slice(5).replace(/\s/g,'')),c=>c.charCodeAt(0)))}catch{throw error('存档码不完整，请重新复制。')}
  }
  return parseRecord(raw);
}
async function hashPin(pin,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
  return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');
}
const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');

export class LocalPetStore{
  constructor(storage=browserStorage,lock=globalThis.navigator?.locks){this.storage=storage;this.lock=lock}
  raw(){try{return this.storage.getItem(SAVE_KEY)}catch{throw storageError()}}
  read(){const raw=this.raw();return raw===null?null:publicRecord(parseRecord(raw))}
  exclusive(fn){return this.lock?this.lock.request(SAVE_KEY,fn):fn()}
  snapshot(allowInvalid=false){
    const raw=this.raw();let record=null;
    if(raw!==null){try{record=parseRecord(raw)}catch(e){if(!allowInvalid)throw e}}
    return {raw,record};
  }
  conflict(){throw error('另一个页面刚更新了小窝，已读取最新进度，请再点一次。',409,this.read())}
  save(pet,previous,backup=false){
    // Recheck after asynchronous PIN hashing, also on browsers without Web Locks.
    if(this.raw()!==previous.raw)this.conflict();
    const record=validateRecord({format:FORMAT,version:1,revision:(previous.record?.revision||0)+1,savedAt:Date.now(),pet:{...pet,parentConfigured:!!pet._parent}});
    try{
      if(backup&&previous.raw!==null)this.storage.setItem(PREVIOUS_KEY,previous.raw);
      this.storage.setItem(SAVE_KEY,JSON.stringify(record));
    }catch{throw storageError()}
    return publicRecord(record);
  }
  adopt(){return this.exclusive(()=>{const previous=this.snapshot();return previous.record?publicRecord(previous.record):this.save(freshPet(),previous)})}
  async verifyPin(previous,pin){
    const auth=previous.record.pet._parent;
    if(!auth)throw error('请先由爸爸妈妈设置家长密码。');
    if(auth.lockedUntil>Date.now())throw error('密码尝试较多，请 10 分钟后再试。',429);
    if(!/^\d{6}$/.test(pin||'')||await hashPin(pin,auth.salt)!==auth.hash){
      const failures=(auth.lockedUntil&&auth.lockedUntil<=Date.now()?0:auth.failures)+1;
      const pet=copy(previous.record.pet);pet._parent={...auth,failures,lockedUntil:failures>=5?Date.now()+600000:0};
      const data=this.save(pet,previous);
      throw error(failures>=5?'密码尝试较多，请 10 分钟后再试。':'家长密码不对，请再试一次。',401,data);
    }
    return {...auth,failures:0,lockedUntil:0};
  }
  act(action,value,pin,revision){return this.exclusive(async()=>{
    const previous=this.snapshot();
    if(!previous.record)throw error('请先领养小狐狸。',404);
    if(previous.record.revision!==revision)this.conflict();
    const stored=previous.record.pet;let auth=stored._parent,next;
    if(action==='parentSetup'){
      if(auth)throw error('家长密码已经设置，请使用原来的密码。');
      if(!/^\d{6}$/.test(pin||''))throw error('请设置 6 位数字家长密码。');
      const salt=randomId();auth={salt,hash:await hashPin(pin,salt),failures:0,lockedUntil:0};next=normalizePet(stored);
    }else if(action==='parentAward'){
      auth=await this.verifyPin(previous,pin);next=grantPoints(stored,value);
      if(next.points>1000000000||next.totalPoints>1000000000)throw error('积分已达到上限，暂时不能继续发放。');
    }else{
      try{next=changePet(stored,action,value)}catch(e){throw error(/[\u4e00-\u9fff]/.test(e.message)?e.message:'这个动作暂时不能做，请先结束当前互动或叫醒团团。')}
    }
    if(['bath','play','count','memory','dance'].includes(action))next.activity={action,id:randomId()};
    if(auth)next._parent=auth;
    return this.save(next,previous);
  })}
  exportBackup(){
    const {record}=this.snapshot();if(!record)throw error('先领养小狐狸，再备份存档。');
    return 'FOX1.'+btoa(Array.from(new TextEncoder().encode(JSON.stringify(record)),x=>String.fromCharCode(x)).join(''));
  }
  importBackup(text,pin,revision){return this.exclusive(async()=>{
    const imported=decodeBackup(text),previous=this.snapshot(true);
    if((previous.record?.revision||0)!==revision)this.conflict();
    if(previous.record?.pet._parent)await this.verifyPin(previous,pin);
    return this.save(imported.pet,previous,true);
  })}
}

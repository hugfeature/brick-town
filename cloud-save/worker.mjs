import {freshPet,changePet,normalizePet,grantPoints} from './state.mjs';

const SITE_ORIGIN='https://little-fox-playhouse.wangwang19920321.chatgpt.site';
const ALLOWED_ORIGINS=new Set(['https://hugfeature.github.io',SITE_ORIGIN,'http://terminal.local:4173']);
const publicPet=state=>({...normalizePet(state),parentConfigured:!!state._parent});
async function hashPin(pin,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');}
const noCache={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

export async function handlePetRequest(request,env) {
  const origin=request.headers.get('Origin');
  const headers={...noCache,'Content-Type':'application/json; charset=utf-8','Vary':'Origin'};
  if(origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!ALLOWED_ORIGINS.has(origin)) return reply({error:'来源不支持'},403);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
  if(!['GET','POST'].includes(request.method)) return reply({error:'不支持的操作'},405);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{48}$/.test(token)) return reply({error:'请用完整的家庭链接打开'},401);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const id=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  if(!env.DB) return reply({error:'云端小窝暂时没连上，请稍后再试'},503);
  try {
    const db=env.DB;
    const read=()=>db.prepare('SELECT state, revision, last_request FROM pet_homes WHERE id = ?').bind(id).first();
    let row=await read();
    if(request.method==='GET') return row?reply({pet:publicPet(JSON.parse(row.state)),revision:row.revision}):reply({error:'没有找到这个小窝，请检查家庭链接'},404);
    const raw=await request.text();
    if(raw.length>2048) return reply({error:'请求太长'},413);
    let body;try{body=JSON.parse(raw)}catch{return reply({error:'请求格式不对'},400)}
    if(!body||typeof body!=='object'||!/^[a-f0-9-]{20,64}$/.test(body.requestId||'')) return reply({error:'无效请求'},400);
    if(body.action==='adopt') {
      await db.prepare('INSERT OR IGNORE INTO pet_homes (id, state, revision, last_request, updated_at) VALUES (?, ?, 1, ?, ?)').bind(id,JSON.stringify(freshPet()),body.requestId,Date.now()).run();
      row=await read();return reply({pet:publicPet(JSON.parse(row.state)),revision:row.revision});
    }
    if(!row) return reply({error:'没有找到这个小窝'},404);
    if(row.last_request===body.requestId) return reply({pet:publicPet(JSON.parse(row.state)),revision:row.revision});
    if(!Number.isSafeInteger(body.revision)||body.revision!==row.revision) return reply({error:'另一部手机刚刚更新了小窝，已帮你同步，请再点一次。',pet:publicPet(JSON.parse(row.state)),revision:row.revision},409);
    const stored=JSON.parse(row.state);let auth=stored._parent,next;
    if(body.action==='parentSetup'){
      if(auth)return reply({error:'家长密码已经设置，请使用原来的密码。'},400);
      if(!/^\d{6}$/.test(body.pin||''))return reply({error:'请设置 6 位数字家长密码。'},400);
      const salt=crypto.randomUUID();auth={salt,hash:await hashPin(body.pin,salt),failures:0,lockedUntil:0};next=normalizePet(stored);
    }else if(body.action==='parentAward'){
      if(!auth)return reply({error:'请先由爸爸妈妈设置家长密码。'},400);
      if(auth.lockedUntil>Date.now())return reply({error:'密码尝试较多，请 10 分钟后再试。'},429);
      if(!/^\d{6}$/.test(body.pin||'')||await hashPin(body.pin,auth.salt)!==auth.hash){
        const failures=(auth.lockedUntil&&auth.lockedUntil<=Date.now()?0:auth.failures||0)+1;
        stored._parent={...auth,failures,lockedUntil:failures>=5?Date.now()+600000:0};
        const failed=await db.prepare('UPDATE pet_homes SET state = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(stored),Date.now(),id,body.revision).run();
        row=await read();return reply({error:failed.meta.changes===1?(failures>=5?'密码尝试较多，请 10 分钟后再试。':'家长密码不对，请再试一次。'):'小窝刚刚更新了，请再试一次。',pet:publicPet(JSON.parse(row.state)),revision:row.revision},failed.meta.changes===1?401:409);
      }
      auth={...auth,failures:0,lockedUntil:0};
      try{next=grantPoints(stored,body.value)}catch(error){return reply({error:error.message},400)}
    }else{
      try{next=changePet(stored,body.action,body.value)}catch(error){return reply({error:error.message==='积分还不够，请爸爸妈妈确认任务后发积分。'?error.message:'这个动作暂时不能做，请刷新看看团团。'},400)}
    }
    if(['bath','play','count','memory','dance'].includes(body.action))next.activity={action:body.action,id:body.requestId};
    if(auth)next._parent=auth;
    const result=await db.prepare('UPDATE pet_homes SET state = ?, revision = revision + 1, last_request = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(next),body.requestId,Date.now(),id,body.revision).run();
    if(result.meta.changes!==1){row=await read();return reply({error:'另一部手机刚刚更新了小窝，已帮你同步，请再点一次。',pet:publicPet(JSON.parse(row.state)),revision:row.revision},409)}
    return reply({pet:publicPet(next),revision:body.revision+1});
  } catch { return reply({error:'云端暂时没连上，进度没有确认保存，请重试。'},503); }
}

export default {fetch(request,env){if(new URL(request.url).pathname!=='/api/pet')return new Response('Not found',{status:404});return handlePetRequest(request,env)}};

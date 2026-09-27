import {freshPet,changePet} from './state.mjs';

const SITE_ORIGIN='https://little-fox-playhouse.wangwang19920321.chatgpt.site';
const ALLOWED_ORIGINS=new Set(['https://hugfeature.github.io',SITE_ORIGIN,'http://terminal.local:4173']);
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
    if(request.method==='GET') return row?reply({pet:JSON.parse(row.state),revision:row.revision}):reply({error:'没有找到这个小窝，请检查家庭链接'},404);
    const raw=await request.text();
    if(raw.length>2048) return reply({error:'请求太长'},413);
    let body;try{body=JSON.parse(raw)}catch{return reply({error:'请求格式不对'},400)}
    if(!body||typeof body!=='object'||!/^[a-f0-9-]{20,64}$/.test(body.requestId||'')) return reply({error:'无效请求'},400);
    if(body.action==='adopt') {
      await db.prepare('INSERT OR IGNORE INTO pet_homes (id, state, revision, last_request, updated_at) VALUES (?, ?, 1, ?, ?)').bind(id,JSON.stringify(freshPet()),body.requestId,Date.now()).run();
      row=await read();return reply({pet:JSON.parse(row.state),revision:row.revision});
    }
    if(!row) return reply({error:'没有找到这个小窝'},404);
    if(row.last_request===body.requestId) return reply({pet:JSON.parse(row.state),revision:row.revision});
    if(!Number.isSafeInteger(body.revision)||body.revision!==row.revision) return reply({error:'另一部手机刚刚更新了小窝，已帮你同步，请再点一次。',pet:JSON.parse(row.state),revision:row.revision},409);
    let next;try{next=changePet(JSON.parse(row.state),body.action,body.value)}catch{return reply({error:'这个动作暂时不能做，请刷新看看团团。'},400)}
    const result=await db.prepare('UPDATE pet_homes SET state = ?, revision = revision + 1, last_request = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(next),body.requestId,Date.now(),id,body.revision).run();
    if(result.meta.changes!==1){row=await read();return reply({error:'另一部手机刚刚更新了小窝，已帮你同步，请再点一次。',pet:JSON.parse(row.state),revision:row.revision},409)}
    return reply({pet:next,revision:body.revision+1});
  } catch { return reply({error:'云端暂时没连上，进度没有确认保存，请重试。'},503); }
}

export default {fetch(request,env){if(new URL(request.url).pathname!=='/api/pet')return new Response('Not found',{status:404});return handlePetRequest(request,env)}};

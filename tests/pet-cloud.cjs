const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
(async()=>{
 const {handlePetRequest}=await import('../cloud-save/worker.mjs');
 const {freshPet,changePet,energyNow,normalizePet}=await import('../pet/state.mjs');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(require('node:path').join(__dirname,'../cloud-save/schema.sql'),'utf8'));
 const DB={prepare(query){return {bind(...args){return {
   async first(){return sql.prepare(query).get(...args)},
   async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}}
 }}}}};
 const token='a'.repeat(48),other='b'.repeat(48);let id=0;
 async function send(body,key=token,origin='https://hugfeature.github.io'){
   const response=await handlePetRequest(new Request('https://test.invalid/api/pet',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,Origin:origin},body:body?JSON.stringify({requestId:(++id).toString(16).padStart(32,'0'),...body}):undefined}),{DB});
   return {status:response.status,body:await response.json(),headers:response.headers};
 }
 assert.equal((await send()).status,404);
 let a=await send({action:'adopt'});assert.equal(a.status,200);assert.equal(a.body.revision,1);
 assert.equal(a.headers.get('Access-Control-Allow-Origin'),'https://hugfeature.github.io');
 const feed={action:'feed',value:'apple',revision:1,requestId:'c'.repeat(32)};
 a=await send(feed);assert.equal(a.body.pet.food,97);assert.equal(a.body.pet.care,1);assert.equal(a.body.revision,2);
 a=await send(feed);assert.equal(a.body.pet.care,1);assert.equal(a.body.revision,2,'exact retry must not double-feed');
 a=await send({action:'bath',revision:1});assert.equal(a.status,409);assert.equal(a.body.pet.clean,70,'stale device must not overwrite');
 const read=await send();assert.equal(read.body.pet.food,97,'new device must read saved state');
 assert.equal((await send(undefined,other)).status,404,'family isolation');
 a=await send({action:'adopt'},other);assert.equal(a.body.pet.food,75);
 assert.equal((await send({action:'erase',revision:2})).status,400);
 assert.equal((await send({action:'rename',value:'',revision:2})).status,400);
 assert.equal((await send(undefined,'bad')).status,401);
 assert.equal((await send(undefined,token,'https://evil.invalid')).status,403);
 const sleeping=changePet(freshPet(),'sleep',null,100000);
 assert.equal(energyNow(sleeping,109000),100);
 assert.throws(()=>changePet(sleeping,'feed','apple',109000));
 assert.equal(changePet(sleeping,'wake',null,109000).energy,100);
 assert.equal(energyNow(sleeping,99000),75,'clock reversal cannot drain energy');
 assert.deepEqual(normalizePet(null),freshPet());
 assert.equal(normalizePet({food:10000,energy:-8}).food,100);
 assert.equal(normalizePet({food:10000,energy:-8}).energy,0);
 assert.deepEqual((await send()).body.pet.stickers,['feed']);
 sql.close();console.log('PASS: cloud save, cross-device read, duplicate request, stale-write protection, family isolation, invalid inputs, sleep recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});

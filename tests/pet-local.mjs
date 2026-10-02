import assert from 'node:assert/strict';
import {LocalPetStore,SAVE_KEY,PREVIOUS_KEY,decodeBackup} from '../pet/local-store.mjs';

class MemoryStorage{
  values=new Map();fail=false;
  getItem(key){return this.values.get(key)??null}
  setItem(key,value){if(this.fail)throw new Error('QuotaExceededError');this.values.set(key,value)}
}
const memory=new MemoryStorage(),store=new LocalPetStore(memory,null),pin='724681';
let state=await store.adopt();
const act=async(action,value,password)=>state=await store.act(action,value,password,state.revision);
assert.equal(state.pet.points,0);assert.equal((await store.adopt()).revision,1,'re-adoption cannot erase progress');
await assert.rejects(()=>act('feed','apple'),/积分还不够/);
await act('parentSetup',undefined,pin);
assert(!memory.getItem(SAVE_KEY).includes(pin),'PIN is not stored in plain text');
await assert.rejects(()=>act('parentAward',{task:'homework'},'000000'),e=>e.status===401);
state=store.read();assert.equal(state.pet.points,0);
await act('parentAward',{task:'homework'},pin);
assert.equal(state.pet.points,20);
await assert.rejects(()=>act('parentAward',{task:'homework'},pin),/已经发过/);
await act('feed','apple');assert.equal(state.pet.points,15);assert.equal(state.pet.food,97);
await act('bath');assert.equal(state.pet.points,7);const activity=state.pet.activity;
assert.deepEqual(new LocalPetStore(memory,null).read(),state,'refresh restores full progress and paid activity');
await act('finish',activity.id);assert.equal(state.pet.points,7);assert.equal(state.pet.activity,null);
await act('rename','小火狐🦊');
const backup=store.exportBackup(),exported=decodeBackup(backup);
assert.equal(exported.pet.name,'小火狐🦊');assert(!JSON.stringify(state).includes('_parent'));
const otherMemory=new MemoryStorage(),other=new LocalPetStore(otherMemory,null);
assert.equal(other.read(),null,'another browser starts without this pet');
const imported=await other.importBackup(backup,undefined,0);
assert.deepEqual(imported.pet,state.pet,'backup preserves progress, ledger, and parent setup');
const otherState=await other.act('parentAward',{task:'reading'},pin,imported.revision);
assert.equal(otherState.pet.points,17);assert.equal(store.read().pet.points,7,'imported devices subsequently save independently');
const before=memory.getItem(SAVE_KEY);
memory.fail=true;
await assert.rejects(()=>act('pet'),e=>e.status===507);
assert.equal(memory.getItem(SAVE_KEY),before,'a failed write does not claim or apply progress');
memory.fail=false;
await assert.rejects(()=>store.importBackup('FOX1.broken',pin,state.revision));
assert.equal(memory.getItem(SAVE_KEY),before,'invalid import cannot touch existing progress');
await assert.rejects(()=>store.importBackup(backup,'000000',state.revision),e=>e.status===401);
state=store.read();assert.equal(state.pet.points,7,'existing parent PIN protects replacement');
const preImport=memory.getItem(SAVE_KEY);
state=await store.importBackup(backup,pin,state.revision);
assert.equal(memory.getItem(PREVIOUS_KEY),preImport,'replacement preserves previous local save');
const stale=state.revision;
await act('pet');
await assert.rejects(()=>store.act('rename','过期页面',undefined,stale),e=>e.status===409&&e.data.pet.name==='小火狐🦊');
// A browser lacking Web Locks must still reject stale writes after async hashing.
const concurrentMemory=new MemoryStorage(),a=new LocalPetStore(concurrentMemory,null),b=new LocalPetStore(concurrentMemory,null);
await a.adopt();
const results=await Promise.allSettled([a.act('parentSetup',undefined,pin,1),b.act('parentSetup',undefined,'654321',1)]);
assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
// Malformed storage is never silently replaced with a fresh pet, but a valid backup can recover it.
const corruptMemory=new MemoryStorage();corruptMemory.setItem(SAVE_KEY,'broken');
const corrupt=new LocalPetStore(corruptMemory,null);
assert.throws(()=>corrupt.read());assert.throws(()=>corrupt.adopt());
assert.equal(corruptMemory.getItem(SAVE_KEY),'broken');
await corrupt.importBackup(backup,undefined,0);
assert.equal(corrupt.read().pet.points,7);assert.equal(corruptMemory.getItem(PREVIOUS_KEY),'broken');
for(let i=0;i<5;i++){
  await assert.rejects(()=>act('parentAward',{task:'reading'},'000000'),e=>e.status===401);
  state=store.read();
}
await assert.rejects(()=>act('parentAward',{task:'reading'},pin),e=>e.status===429);
const blocked=new LocalPetStore({getItem(){throw new Error('SecurityError')}},null);
assert.throws(()=>blocked.read(),e=>e.status===507);
console.log('PASS: local persistence, independent browsers, parent PIN, daily awards, paid activity recovery, Unicode backup/import, replacement protection, write failure, stale and concurrent writes, corrupt-save recovery, lockout.');

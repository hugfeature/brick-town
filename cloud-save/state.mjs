import {RULES,TASKS,taskState} from './rules.mjs';
export const ACTIONS = ['feed','bath','play','sleep','wake','pet','rename','count','memory','dance','finish'];
export function freshPet() {
  return {name:'团团',food:75,clean:70,joy:80,energy:75,care:0,stickers:[],sleeping:false,sleepStarted:0,points:0,totalPoints:0,tasks:{day:'',done:[]},ledger:[],parentConfigured:false,activity:null};
}
export function normalizePet(value) {
  const pet=freshPet();
  if(!value || typeof value!=='object') return pet;
  if(typeof value.name==='string' && value.name.trim()) pet.name=Array.from(value.name.trim()).slice(0,8).join('');
  for(const k of ['food','clean','joy','energy']) if(Number.isFinite(value[k])) pet[k]=Math.max(0,Math.min(100,Math.round(value[k])));
  if(Number.isSafeInteger(value.care)&&value.care>=0) pet.care=Math.min(value.care,1000000);
  pet.stickers=Array.isArray(value.stickers)?[...new Set(value.stickers.filter(x=>['feed','bath','play','sleep'].includes(x)))]:[];
  pet.sleeping=value.sleeping===true;
  pet.sleepStarted=Number.isSafeInteger(value.sleepStarted)&&value.sleepStarted>0?value.sleepStarted:0;
  for(const k of ['points','totalPoints']) if(Number.isSafeInteger(value[k])&&value[k]>=0)pet[k]=Math.min(value[k],1000000000);
  pet.parentConfigured=value.parentConfigured===true;
  if(value.activity&&['bath','play','count','memory','dance'].includes(value.activity.action)&&/^[a-f0-9-]{20,64}$/.test(value.activity.id||''))pet.activity={action:value.activity.action,id:value.activity.id};
  if(value.tasks&&/^\d{4}-\d{2}-\d{2}$/.test(value.tasks.day))pet.tasks={day:value.tasks.day,done:Array.isArray(value.tasks.done)?[...new Set(value.tasks.done.filter(x=>Object.hasOwn(TASKS,x)))]:[]};
  if(Array.isArray(value.ledger))pet.ledger=value.ledger.filter(x=>x&&Number.isSafeInteger(x.at)&&Number.isSafeInteger(x.amount)&&typeof x.label==='string').slice(0,12).map(x=>({...x,label:x.label.slice(0,30)}));
  return pet;
}
export function energyNow(pet,now=Date.now()) {
  return pet.sleeping&&pet.sleepStarted?Math.min(100,pet.energy+Math.floor(Math.max(0,now-pet.sleepStarted)/1000)*4):pet.energy;
}
export function changePet(previous,action,value,now=Date.now()) {
  if(!ACTIONS.includes(action)) throw new Error('Unknown action');
  const p=normalizePet(previous);
  if(p.sleeping&&!['wake','rename'].includes(action)) throw new Error('Pet is sleeping');
  const add=(key,n)=>{p[key]=Math.max(0,Math.min(100,p[key]+n))};
  if(action==='finish'){if(!p.activity||value!==p.activity.id)throw new Error('No matching activity');p.activity=null;return p;}
  if(action==='rename') {
    if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>8||/[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid name');
    p.name=value.trim(); return p;
  }
  if(action==='wake') {
    if(!p.sleeping) return p;
    p.energy=energyNow(p,now);p.sleeping=false;p.sleepStarted=0;return p;
  }
  if(p.activity&&['bath','play','count','memory','dance'].includes(action))throw new Error('Resume current activity first');
  if(Object.hasOwn(RULES,action)){const rule=RULES[action];if(p.points<rule.cost)throw new Error('积分还不够，请爸爸妈妈确认任务后发积分。');p.points-=rule.cost;record(p,'兑换'+rule.label,-rule.cost,now);}
  if(action==='feed') {if(!['apple','carrot','fish'].includes(value)) throw new Error('Invalid food');add('food',22);add('joy',3);}
  if(action==='bath') {add('clean',35);add('joy',4);}
  if(['play','count','memory','dance'].includes(action)) {add('joy',20);add('energy',-8);add('food',-5);add('clean',-4);}
  if(action==='pet') add('joy',3);
  if(action==='sleep') {p.sleeping=true;p.sleepStarted=now;}
  if(action!=='pet'){p.care=Math.min(1000000,p.care+1);if(['feed','bath','play','sleep'].includes(action)&&!p.stickers.includes(action))p.stickers.push(action);}
  return p;
}

function record(p,label,amount,now){p.ledger.unshift({label,amount,at:now});p.ledger=p.ledger.slice(0,12)}
// Called only after the API has verified the parent's PIN.
export function grantPoints(previous,value,now=Date.now()){
  const p=normalizePet(previous);let amount,label;
  const today=taskState(p,now);p.tasks={day:today.day,done:[...today.done]};
  if(value&&Object.hasOwn(TASKS,value.task)){
    if(p.tasks.done.includes(value.task))throw new Error('今天这项任务已经发过积分啦。');
    const task=TASKS[value.task];amount=task.points;label=task.label;p.tasks.done.push(value.task);
  }else{
    if(!value||value.task!=='custom'||!Number.isSafeInteger(value.points)||value.points<1||value.points>500||typeof value.reason!=='string'||!value.reason.trim()||Array.from(value.reason.trim()).length>20)throw new Error('请填写 1～500 分和 1～20 字的奖励原因。');
    amount=value.points;label=value.reason.trim();
  }
  p.points+=amount;p.totalPoints+=amount;record(p,'家长奖励：'+label,amount,now);return p;
}

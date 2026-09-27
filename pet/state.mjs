export const ACTIONS = ['feed','bath','play','sleep','wake','pet','rename'];
export function freshPet() {
  return {name:'团团',food:75,clean:70,joy:80,energy:75,care:0,stickers:[],sleeping:false,sleepStarted:0};
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
  if(action==='rename') {
    if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>8||/[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid name');
    p.name=value.trim(); return p;
  }
  if(action==='wake') {
    if(!p.sleeping) return p;
    p.energy=energyNow(p,now);p.sleeping=false;p.sleepStarted=0;return p;
  }
  if(action==='feed') {if(!['apple','carrot','fish'].includes(value)) throw new Error('Invalid food');add('food',22);add('joy',3);}
  if(action==='bath') {add('clean',35);add('joy',4);}
  if(action==='play') {add('joy',20);add('energy',-8);add('food',-5);add('clean',-4);}
  if(action==='pet') add('joy',3);
  if(action==='sleep') {p.sleeping=true;p.sleepStarted=now;}
  if(action!=='pet'){p.care=Math.min(1000000,p.care+1);if(!p.stickers.includes(action))p.stickers.push(action);}
  return p;
}

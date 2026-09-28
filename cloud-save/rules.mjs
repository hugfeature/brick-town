// Trial prices and task awards. Keep the server and frontend copies in sync.
export const RULES=Object.freeze({
  feed:{label:'喂一喂',icon:'🍎',cost:5},bath:{label:'洗香香',icon:'🛁',cost:8},
  play:{label:'找颜色',icon:'🎨',cost:10},count:{label:'数星星',icon:'⭐',cost:10},
  memory:{label:'翻翻配对',icon:'🃏',cost:12},dance:{label:'跳个舞',icon:'🎵',cost:6}
});
export const TASKS=Object.freeze({homework:{label:'完成作业',icon:'✏️',points:20},reading:{label:'阅读打卡',icon:'📖',points:10},checkin:{label:'习惯打卡',icon:'✅',points:5}});
export function dayKey(now=Date.now()){return new Date(now+8*60*60*1000).toISOString().slice(0,10)}
export function taskState(pet,now=Date.now()){return pet.tasks?.day===dayKey(now)?pet.tasks:{day:dayKey(now),done:[]};}

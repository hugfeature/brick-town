export const CLOUD_ORIGIN='https://little-fox-playhouse.wangwang19920321.chatgpt.site';
export const FAMILY_PAGE='https://hugfeature.github.io/brick-town/pet/';
const valid=/^[a-f0-9]{48}$/;
export function parseFamilyKey(input){
  if(typeof input!=='string')return '';
  const text=input.trim();
  if(valid.test(text))return text;
  try{const url=new URL(text);if(!['https://hugfeature.github.io',CLOUD_ORIGIN].includes(url.origin))return '';const key=new URLSearchParams(url.hash.slice(1)).get('home')||'';return valid.test(key)?key:''}catch{return ''}
}
export function familyLink(key,direct=false){if(!valid.test(key))return '';return (direct?CLOUD_ORIGIN+'/pet/index.html':FAMILY_PAGE)+'#home='+key}
export function connectionHint({hasKey,connected,working,missing,offline,pending}){
  if(working)return {title:pending?'正在确认上次保存…':'正在连接小窝…',detail:'正在读取云端存档，请稍等。'};
  if(!hasKey)return {title:'第一次玩，还是回到原来的小窝？',detail:'换手机请打开家人发来的完整家庭链接，或粘贴家庭口令。'};
  if(connected)return {title:'已连接云端',detail:'宠物和积分已经同步。换手机请用同一个家庭链接。'};
  if(offline)return {title:'当前设备没有联网',detail:'连上网络后，点“重新连接”。未确认的操作不会当作保存成功。'};
  if(missing)return {title:'这个链接还没有找到存档',detail:'请从原手机复制完整家庭链接；如果上次领养中断，可以点“重新连接”继续。'};
  return {title:pending?'上次保存尚未确认':'暂时无法连接云端',detail:'点“重新连接”再试。在微信里仍失败时，可用右上角菜单在 Safari 或系统浏览器打开；也可试试独立页面。'};
}

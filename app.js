(function(){
'use strict';
var PDFLib=window.PDFLib,pdfjsLib=window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var FREE={bytes:20*1024*1024,daily:10,merge:5,imgs:20};
var uid=0,nid=function(){return 'i'+(++uid)};
var I={
 up:'<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
 down:'<svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>',
 x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
 rl:'<svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5"/><path d="M4 4v5h5"/></svg>',
 rr:'<svg viewBox="0 0 24 24"><path d="M20 9a8 8 0 1 0 1 5"/><path d="M20 4v5h-5"/></svg>',
 del:'<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
 undo:'<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
};
var GRIP='⋮⋮';

/* ---------- 基础工具 ---------- */
function fmtSize(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB'}
function baseName(n){return n.replace(/\.[^.]+$/,'')}
var toastT;
function toast(m){var t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},3600)}
function busy(on,txt){$('#busy').hidden=!on;if(txt)$('#busy-t').textContent=txt}
function tick(){return new Promise(function(r){setTimeout(r,30)})}

/* ---------- 授权 / 限额 ---------- */
function ck(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
 var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',o='';for(var j=0;j<4;j++){o+=A[h&31];h>>>=5}return o}
// 占位校验：真实发售时换成服务端签发 + 本地公钥验签。此处不含任何真实密钥。
function keyOk(k){k=(k||'').trim().toUpperCase();var m=/^PBOX-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(k);
 return !!m&&ck('PBOX'+m[1]+m[2])===m[3]}
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
function isPro(){return keyOk(ls('pdfbox.key'))}
function today(){var d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()}
function used(){try{var u=JSON.parse(ls('pdfbox.use')||'{}');return u.d===today()?u.n:0}catch(e){return 0}}
function addUse(){ls('pdfbox.use',JSON.stringify({d:today(),n:used()+1}))}
function refreshTop(){var p=isPro();$('#proBtn').classList.toggle('on',p);$('#proBtn').textContent=p?'Pro 已解锁':'Pro 解锁';
 $('#usage').textContent=p?'不限次数':'今日剩余 '+Math.max(0,FREE.daily-used())+'/'+FREE.daily;$('#usage').hidden=false}
function openPro(why){$('#m-why').textContent=why||'解除免费版限制，适合经常处理文件的人。';var p=isPro();
 $('#m-state').hidden=!p;$('#m-form').hidden=p;$('#m-msg').textContent='';$('#m-key').value='';$('#modal').hidden=false;if(!p)setTimeout(function(){$('#m-key').focus()},50)}
function closePro(){$('#modal').hidden=true}
$('#proBtn').onclick=$('#usage').onclick=function(){openPro()};
$('#m-x').onclick=closePro;
$('#modal').addEventListener('mousedown',function(e){if(e.target===this)closePro()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closePro()});
$('#m-ok').onclick=function(){var k=$('#m-key').value;if(keyOk(k)){ls('pdfbox.key',k.trim().toUpperCase());refreshTop();closePro();toast('已解锁 Pro')}else $('#m-msg').textContent='授权码不正确，请检查后重试'};
$('#m-key').addEventListener('keydown',function(e){if(e.key==='Enter')$('#m-ok').click()});
$('#m-off').onclick=function(){ls('pdfbox.key',null);refreshTop();closePro();toast('已移除授权码')};
function needQuota(){if(isPro())return true;if(used()>=FREE.daily){openPro('今天的 '+FREE.daily+' 次免费导出已用完，明天自动恢复，或解锁 Pro 不限次数。');return false}return true}
function needPro(why){if(isPro())return true;openPro(why);return false}

/* ---------- 文件读取 ---------- */
function readBuf(f){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result)};r.onerror=function(){rej(new Error('读取失败'))};r.readAsArrayBuffer(f)})}
async function loadPdfFile(f){
 if(!isPro()&&f.size>FREE.bytes){openPro('「'+f.name+'」有 '+fmtSize(f.size)+'，免费版单文件限 20MB。');return null}
 var buf=await readBuf(f),doc;
 try{doc=await PDFLib.PDFDocument.load(buf)}catch(e){
  toast(/encrypt/i.test(e.message||e.name||'')?'「'+f.name+'」有密码保护，暂不支持':'「'+f.name+'」打开失败，可能不是有效的 PDF');return null}
 return {id:nid(),name:f.name,size:f.size,buf:buf,pages:doc.getPageCount()};
}
async function pdfjsDoc(buf){return pdfjsLib.getDocument({data:new Uint8Array(buf.slice(0))}).promise}
var rq=Promise.resolve();
function enqueue(fn){rq=rq.then(fn).catch(function(){});return rq}
async function drawPage(doc,no,canvas,w){
 var p=await doc.getPage(no),v1=p.getViewport({scale:1}),dpr=Math.min(window.devicePixelRatio||1,2);
 var vp=p.getViewport({scale:w*dpr/v1.width});canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);
 var c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
 await p.render({canvasContext:c,viewport:vp}).promise;
}
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);e.target._go&&e.target._go()}})},{rootMargin:'300px'}):null;
function lazy(el,fn){el._go=fn;if(io)io.observe(el);else fn()}
function fit(tw,cv,rot){ // 把画布按旋转角度放进缩略框
 var bw=tw.clientWidth,bh=tw.clientHeight,cw=cv.width,ch=cv.height;if(!cw||!bw)return;
 var odd=rot%180!==0,w=odd?ch:cw,h=odd?cw:ch,s=Math.min(bw/w,bh/h);
 cv.style.width=(cw*s)+'px';cv.style.height=(ch*s)+'px';
 cv.style.transform='translate(-50%,-50%) rotate('+rot+'deg)';
}

/* ---------- 排序（指针事件，鼠标和触屏通用） ---------- */
function sortable(box,itemSel,onDone){
 box.addEventListener('pointerdown',function(e){
  var g=e.target.closest('.grip');var item=g&&g.closest(itemSel);
  if(!item||!box.contains(item)||(e.button&&e.pointerType==='mouse'))return;
  e.preventDefault();item.classList.add('dragging');
  var mv=function(ev){var t=document.elementFromPoint(ev.clientX,ev.clientY),o=t&&t.closest&&t.closest(itemSel);
   if(o&&o!==item&&o.parentNode===box){var k=[].indexOf.call(box.children,item),m=[].indexOf.call(box.children,o);if(k<m)o.after(item);else o.before(item)}
   if(ev.clientY<70)window.scrollBy(0,-14);else if(ev.clientY>innerHeight-70)window.scrollBy(0,14)};
  var up=function(){item.classList.remove('dragging');window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
   onDone([].map.call(box.children,function(c){return c.dataset.id}))};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
 });
}
function reorder(arr,ids){var m={};arr.forEach(function(x){m[x.id]=x});return ids.map(function(i){return m[i]}).filter(Boolean)}

/* ---------- 下载 / ZIP ---------- */
var lastUrl=null;
function deliver(bytes,name,mime,desc){
 var blob=new Blob([bytes],{type:mime||'application/pdf'});
 if(lastUrl)URL.revokeObjectURL(lastUrl);lastUrl=URL.createObjectURL(blob);
 var a=document.createElement('a');a.href=lastUrl;a.download=name;document.body.appendChild(a);a.click();a.remove();
 var r=$('#result');r.hidden=false;$('#result-t').textContent=name+' · '+(desc?desc+' · ':'')+fmtSize(blob.size);
 var b=$('#result-a');b.href=lastUrl;b.download=name;
 addUse();refreshTop();
}
var crcT=(function(){var t=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){var c=0xFFFFFFFF;for(var i=0;i<u.length;i++)c=crcT[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){ // 仅存储，不压缩
 var enc=new TextEncoder(),parts=[],cen=[],off=0;
 files.forEach(function(f){var nm=enc.encode(f.name),d=f.data,crc=crc32(d);
  var h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(8,0,true);h.setUint16(10,0,true);h.setUint16(12,0x21,true);
  h.setUint32(14,crc,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
  parts.push(new Uint8Array(h.buffer),nm,d);
  var c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(12,0,true);c.setUint16(14,0x21,true);
  c.setUint32(16,crc,true);c.setUint32(20,d.length,true);c.setUint32(24,d.length,true);c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
  cen.push(new Uint8Array(c.buffer),nm);off+=30+nm.length+d.length});
 var cs=0;cen.forEach(function(x){cs+=x.length});
 var e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
 return new Blob(parts.concat(cen,[new Uint8Array(e.buffer)]),{type:'application/zip'});
}
function deliverZip(files,name){
 var blob=zip(files);return blob.arrayBuffer().then(function(b){deliver(new Uint8Array(b),name,'application/zip',files.length+' 个文件')});
}

/* ---------- 拖放 / 选择 ---------- */
function bindDrop(id,onFiles){
 var d=$('#'+id),inp=$('input',d);
 inp.onchange=function(){var f=[].slice.call(inp.files);inp.value='';if(f.length)onFiles(f)};
 ['dragenter','dragover'].forEach(function(t){d.addEventListener(t,function(e){e.preventDefault();d.classList.add('over')})});
 ['dragleave','drop'].forEach(function(t){d.addEventListener(t,function(e){e.preventDefault();d.classList.remove('over')})});
 d.addEventListener('drop',function(e){var f=[].slice.call(e.dataTransfer.files);if(f.length)onFiles(f)});
 var more=$('#'+id).parentNode.querySelector('.addmore input');
 if(more)more.onchange=function(){var f=[].slice.call(more.files);more.value='';if(f.length)onFiles(f)};
 var p=d.parentNode;
 p.addEventListener('dragover',function(e){e.preventDefault()});
 p.addEventListener('drop',function(e){if(e.target.closest('.drop'))return;e.preventDefault();var f=[].slice.call(e.dataTransfer.files);if(f.length&&!$('.work',p).hidden)onFiles(f)});
}
function show(sec,hasWork){$('.drop',sec).hidden=hasWork;$('.work',sec).hidden=!hasWork;$('#result').hidden=true}
function isPdf(f){return f.type==='application/pdf'||/\.pdf$/i.test(f.name)}
function pickPdfs(files){var p=files.filter(isPdf);if(p.length<files.length)toast('已忽略 '+(files.length-p.length)+' 个非 PDF 文件');return p}

/* ---------- 标签 ---------- */
$$('#tabs button').forEach(function(b){b.onclick=function(){
 $$('#tabs button').forEach(function(x){x.classList.toggle('on',x===b)});
 $$('.panel').forEach(function(p){p.classList.toggle('on',p.id==='p-'+b.dataset.tool)});$('#result').hidden=true;window.scrollTo(0,0)}});

/* ================= 合并 ================= */
var M={items:[]},mSec=$('#p-merge');
function mRender(){
 var box=$('#merge-list');box.innerHTML='';
 M.items.forEach(function(it,i){
  var r=document.createElement('div');r.className='row';r.dataset.id=it.id;
  r.innerHTML='<span class="grip" title="拖动排序">'+GRIP+'</span><span class="th"></span><div class="nm"><b></b><span></span></div>'+
   '<button class="ib" data-a="up" title="上移">'+I.up+'</button><button class="ib" data-a="dn" title="下移">'+I.down+'</button><button class="ib del" data-a="rm" title="移除">'+I.x+'</button>';
  $('b',r).textContent=it.name;$('.nm span',r).textContent=it.pages+' 页 · '+fmtSize(it.size);
  $('[data-a=up]',r).disabled=i===0;$('[data-a=dn]',r).disabled=i===M.items.length-1;
  var th=$('.th',r);if(it.thumb)th.appendChild(it.thumb);box.appendChild(r)});
 var tp=M.items.reduce(function(a,b){return a+b.pages},0);
 $('#merge-info').textContent=M.items.length+' 个文件 · 共 '+tp+' 页';
 $('#merge-go').disabled=M.items.length<2;$('#merge-go').textContent=M.items.length<2?'至少添加 2 个文件':'合并并下载';
 show(mSec,M.items.length>0);
}
async function mAdd(files){
 files=pickPdfs(files);if(!files.length)return;
 busy(true,'读取文件…');await tick();
 try{for(var f of files){
  if(!isPro()&&M.items.length>=FREE.merge){openPro('免费版一次最多合并 '+FREE.merge+' 个文件，其余的没有加入。');break}
  var it=await loadPdfFile(f);if(!it)continue;M.items.push(it);
  try{var d=await pdfjsDoc(it.buf),c=document.createElement('canvas');await drawPage(d,1,c,90);it.thumb=c;d.destroy()}catch(e){}
 }}finally{busy(false)}
 mRender();
}
bindDrop('drop-merge',mAdd);
$('#merge-list').addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(!b)return;var row=b.closest('.row'),i=M.items.findIndex(function(x){return x.id===row.dataset.id}),a=b.dataset.a;
 if(a==='rm')M.items.splice(i,1);else{var j=a==='up'?i-1:i+1;if(j<0||j>=M.items.length)return;var t=M.items[i];M.items[i]=M.items[j];M.items[j]=t}mRender()});
sortable($('#merge-list'),'.row',function(ids){M.items=reorder(M.items,ids);mRender()});
$('[data-act=clear]',mSec).onclick=function(){M.items=[];mRender()};
$('#merge-go').onclick=async function(){
 if(!needQuota())return;busy(true,'合并中…');await tick();
 try{var out=await PDFLib.PDFDocument.create(),n=0;
  for(var it of M.items){var d=await PDFLib.PDFDocument.load(it.buf),ps=await out.copyPages(d,d.getPageIndices());ps.forEach(function(p){out.addPage(p);n++})}
  var bytes=await out.save();deliver(bytes,'合并-'+M.items.length+'个文件.pdf',null,n+' 页');
 }catch(e){toast('合并失败：'+e.message)}finally{busy(false)}
};

/* ================= 拆分 ================= */
var S={f:null,doc:null,sel:new Set()},sSec=$('#p-split');
function parseRanges(str,n){
 var out=[];str=(str||'').replace(/[,，、;；\s]+/g,',').replace(/[–—－~～]/g,'-').replace(/^,|,$/g,'');if(!str)return {ranges:[]};
 for(var t of str.split(',')){var m=/^(\d*)-(\d*)$/.exec(t),a,b;
  if(m&&(m[1]||m[2])){a=m[1]?+m[1]:1;b=m[2]?+m[2]:n}else if(/^\d+$/.test(t)){a=b=+t}else return {err:'看不懂「'+t+'」，请写成 1-3, 5, 8-'};
  if(a<1||b>n)return {err:'页码超出范围（共 '+n+' 页）'};if(a>b)return {err:'「'+t+'」起始页大于结束页'};
  var r=[];for(var i=a;i<=b;i++)r.push(i);out.push(r)}
 return {ranges:out};
}
function compress(set){var a=[...set].sort(function(x,y){return x-y}),o=[],i=0;
 while(i<a.length){var j=i;while(j+1<a.length&&a[j+1]===a[j]+1)j++;o.push(j>i?a[i]+'-'+a[j]:''+a[i]);i=j+1}return o.join(', ')}
function sSync(fromText){
 var n=S.f.pages,inp=$('#split-range');
 if(!fromText)inp.value=compress(S.sel);
 $$('#split-grid .card').forEach(function(c){c.classList.toggle('pick',S.sel.has(+c.dataset.n))});
 $('#split-sel').textContent=S.sel.size?'已选 '+S.sel.size+' / '+n+' 页':'还没有选页';
 $('#split-go').disabled=!S.sel.size;
}
async function sLoad(files){
 files=pickPdfs(files);if(!files.length)return;busy(true,'读取文件…');await tick();var it;
 try{it=await loadPdfFile(files[0]);if(!it)return;S.f=it;S.sel=new Set();if(S.doc)S.doc.destroy();S.doc=await pdfjsDoc(it.buf)}catch(e){toast('打开失败');return}finally{busy(false)}
 $('#split-info').textContent=it.name+' · '+it.pages+' 页 · '+fmtSize(it.size);
 var g=$('#split-grid');g.innerHTML='';
 for(var i=1;i<=it.pages;i++){(function(i){var c=document.createElement('div');c.className='card';c.dataset.n=i;
  c.innerHTML='<div class="tw"><canvas></canvas></div><div class="meta">'+i+'</div>';g.appendChild(c);
  lazy(c,function(){enqueue(async function(){var cv=$('canvas',c);await drawPage(S.doc,i,cv,150);fit($('.tw',c),cv,0)})})})(i)}
 $('#split-range').value='';sSync(true);show(sSec,true);
}
bindDrop('drop-split',sLoad);
$('#split-grid').addEventListener('click',function(e){var c=e.target.closest('.card');if(!c)return;var n=+c.dataset.n;S.sel.has(n)?S.sel.delete(n):S.sel.add(n);sSync(false)});
$('#split-range').addEventListener('input',function(){var r=parseRanges(this.value,S.f.pages);S.sel=new Set();
 if(r.err){$('#split-sel').textContent=r.err;$('#split-go').disabled=true;$$('#split-grid .card').forEach(function(c){c.classList.remove('pick')});return}
 r.ranges.forEach(function(x){x.forEach(function(p){S.sel.add(p)})});sSync(true)});
$$('#p-split .chips button').forEach(function(b){b.onclick=function(){var n=S.f.pages,q=b.dataset.q;S.sel=new Set();
 for(var i=1;i<=n;i++)if(q==='all'||(q==='odd'&&i%2)||(q==='even'&&i%2===0))S.sel.add(i);sSync(false)}});
$('[data-act=clear]',sSec).onclick=function(){S.f=null;show(sSec,false)};
function sMode(){return $('input[name=smode]:checked').value}
$('#split-mode').addEventListener('change',function(){var m=sMode();$('#split-go').textContent=m==='one'?'提取并下载':'拆分并打包 ZIP';
 if(m!=='one'&&!isPro()){$('input[value=one]').checked=true;$('#split-go').textContent='提取并下载';openPro('按范围或逐页拆成多个文件、打包下载是 Pro 功能。')}});
async function extract(src,pages,rotDelta){var out=await PDFLib.PDFDocument.create(),ps=await out.copyPages(src,pages.map(function(p){return p-1}));ps.forEach(function(p){out.addPage(p)});return out.save()}
$('#split-go').onclick=async function(){
 if(!needQuota())return;var mode=sMode();var r=parseRanges($('#split-range').value,S.f.pages);if(r.err){toast(r.err);return}
 busy(true,'处理中…');await tick();
 try{var src=await PDFLib.PDFDocument.load(S.f.buf),b=baseName(S.f.name);
  var sel=[...S.sel].sort(function(a,b){return a-b});
  if(mode==='one'){var ord=r.ranges.length?[].concat.apply([],r.ranges):sel;
   // 文本里写的顺序（含重复）按原样输出；纯点选时按页序
   var bytes=await extract(src,ord);deliver(bytes,b+'-提取'+ord.length+'页.pdf',null,ord.length+' 页')}
  else{var groups=mode==='each'?sel.map(function(p){return [p]}):r.ranges,files=[];
   for(var k=0;k<groups.length;k++){var g=groups[k],nm=mode==='each'?'第'+g[0]+'页':(g.length>1?'第'+g[0]+'-'+g[g.length-1]+'页':'第'+g[0]+'页');
    files.push({name:b+'-'+nm+'.pdf',data:await extract(src,g)})}
   // 重名保护
   var seen={};files.forEach(function(f){if(seen[f.name]){var c=++seen[f.name];f.name=f.name.replace(/\.pdf$/,'('+c+').pdf')}else seen[f.name]=1});
   await deliverZip(files,b+'-拆分.zip')}
 }catch(e){toast('处理失败：'+e.message)}finally{busy(false)}
};

/* ================= 整理页面 ================= */
var O={f:null,doc:null,pages:[]},oSec=$('#p-organize');
function oCard(p){
 var c=document.createElement('div');c.className='card'+(p.del?' gone':'');c.dataset.id=p.id;
 c.innerHTML='<div class="tw"><canvas></canvas></div><div class="meta"><span>第 '+p.src+' 页</span><span class="grip" title="拖动排序">'+GRIP+'</span></div>'+
  '<div class="tools"><button class="ib" data-a="rl" title="左转 90°">'+I.rl+'</button><button class="ib" data-a="rr" title="右转 90°">'+I.rr+'</button><button class="ib del" data-a="del" title="删除/恢复">'+(p.del?I.undo:I.del)+'</button></div>';
 return c;
}
function oRender(){
 var g=$('#org-grid');g.innerHTML='';
 O.pages.forEach(function(p){var c=oCard(p);g.appendChild(c);var cv=$('canvas',c);
  if(p.canvas){cv.width=p.canvas.width;cv.height=p.canvas.height;cv.getContext('2d').drawImage(p.canvas,0,0);requestAnimationFrame(function(){fit($('.tw',c),cv,p.rot)})}
  else lazy(c,function(){enqueue(async function(){await drawPage(O.doc,p.src,cv,200);var s=document.createElement('canvas');s.width=cv.width;s.height=cv.height;s.getContext('2d').drawImage(cv,0,0);p.canvas=s;fit($('.tw',c),cv,p.rot)})})});
 var keep=O.pages.filter(function(p){return !p.del}).length;
 $('#org-info').textContent=O.f.name+' · 保留 '+keep+' / '+O.f.pages+' 页';
 $('#org-go').disabled=!keep;
}
function oUpdateCard(p){var c=$('#org-grid .card[data-id='+p.id+']');if(!c)return;c.classList.toggle('gone',p.del);$('[data-a=del]',c).innerHTML=p.del?I.undo:I.del;fit($('.tw',c),$('canvas',c),p.rot);
 var keep=O.pages.filter(function(p){return !p.del}).length;$('#org-info').textContent=O.f.name+' · 保留 '+keep+' / '+O.f.pages+' 页';$('#org-go').disabled=!keep}
async function oLoad(files){
 files=pickPdfs(files);if(!files.length)return;busy(true,'读取文件…');await tick();
 try{var it=await loadPdfFile(files[0]);if(!it)return;O.f=it;if(O.doc)O.doc.destroy();O.doc=await pdfjsDoc(it.buf);
  O.pages=[];for(var i=1;i<=it.pages;i++)O.pages.push({id:nid(),src:i,rot:0,del:false});
  oRender();show(oSec,true)}catch(e){toast('打开失败')}finally{busy(false)}
}
bindDrop('drop-organize',oLoad);
$('#org-grid').addEventListener('click',function(e){var b=e.target.closest('button[data-a]');if(!b)return;var id=b.closest('.card').dataset.id,p=O.pages.find(function(x){return x.id===id});
 if(b.dataset.a==='rl')p.rot=(p.rot+270)%360;else if(b.dataset.a==='rr')p.rot=(p.rot+90)%360;else p.del=!p.del;oUpdateCard(p)});
sortable($('#org-grid'),'.card',function(ids){O.pages=reorder(O.pages,ids);var k=O.pages.length;$('#org-info').textContent=$('#org-info').textContent});
$('[data-act=rl]',oSec).onclick=function(){O.pages.forEach(function(p){p.rot=(p.rot+270)%360;oUpdateCard(p)})};
$('[data-act=rr]',oSec).onclick=function(){O.pages.forEach(function(p){p.rot=(p.rot+90)%360;oUpdateCard(p)})};
$('[data-act=reset]',oSec).onclick=function(){O.pages=O.pages.map(function(p){return {id:p.id,src:p.src,rot:0,del:false,canvas:p.canvas}}).sort(function(a,b){return a.src-b.src});oRender()};
$('[data-act=clear]',oSec).onclick=function(){O.f=null;show(oSec,false)};
$('#org-go').onclick=async function(){
 if(!needQuota())return;busy(true,'导出中…');await tick();
 try{var src=await PDFLib.PDFDocument.load(O.f.buf),out=await PDFLib.PDFDocument.create(),keep=O.pages.filter(function(p){return !p.del});
  var cps=await out.copyPages(src,keep.map(function(p){return p.src-1}));
  cps.forEach(function(pg,i){var r=keep[i].rot;if(r){var cur=pg.getRotation().angle;pg.setRotation(PDFLib.degrees(((cur+r)%360+360)%360))}out.addPage(pg)});
  var bytes=await out.save();deliver(bytes,baseName(O.f.name)+'-整理后.pdf',null,keep.length+' 页');
 }catch(e){toast('导出失败：'+e.message)}finally{busy(false)}
};

/* ================= 页码 ================= */
var N={files:[],pos:'bc',doc:null},nSec=$('#p-pagenum');
function pnText(fmt,n,t){return fmt==='dash'?'- '+n+' -':fmt==='of'?n+' / '+t:fmt==='page'?'Page '+n+' of '+t:''+n}
function pnPrev(){
 var pv=$('#pn-pv'),cv=$('canvas',pv),tag=$('#pn-tag'),sz=+$('#pn-size').value,fmt=$('#pn-fmt').value,start=+$('#pn-start').value||0,skip=+$('#pn-skip').value||0;
 if(!N.files.length||!cv.width)return;
 var f=N.files[0],scale=cv.clientWidth/N.pw;
 var first=skip===0?1:1;tag.textContent=skip>=1?'（前 '+skip+' 页不加）':pnText(fmt,start,f.pages);
 if(skip>=1){tag.style.opacity='.0'}else tag.style.opacity='1';
 var show2=skip<1;tag.style.display=show2?'':'none';
 tag.style.fontSize=(sz*scale)+'px';var m=36*scale;tag.style.left=tag.style.right=tag.style.top=tag.style.bottom='auto';
 var p=N.pos;if(p[0]==='t')tag.style.top=m+'px';else tag.style.bottom=m+'px';
 if(p[1]==='l')tag.style.left=m+'px';else if(p[1]==='r')tag.style.right=m+'px';else{tag.style.left='50%';tag.style.transform='translateX(-50%)';return}
 tag.style.transform='none';
}
function nInfo(){var f=N.files;$('#pn-info').textContent=f.length===1?f[0].name+' · '+f[0].pages+' 页':f.length+' 个文件（批量）'}
async function nLoad(files){
 files=pickPdfs(files);if(!files.length)return;
 if(files.length>1&&!isPro()){openPro('批量给多个文件加页码是 Pro 功能，这次只处理第一个。');files=[files[0]]}
 busy(true,'读取文件…');await tick();
 try{var arr=[];for(var f of files){var it=await loadPdfFile(f);if(it)arr.push(it)}if(!arr.length)return;N.files=arr;
  if(N.doc)N.doc.destroy();N.doc=await pdfjsDoc(arr[0].buf);var cv=$('#pn-pv canvas');await drawPage(N.doc,1,cv,300);
  var p=await N.doc.getPage(1);N.pw=p.getViewport({scale:1}).width;
  nInfo();show(nSec,true);pnPrev()}catch(e){toast('打开失败')}finally{busy(false)}
}
bindDrop('drop-pagenum',nLoad);
$('#pn-pos').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;N.pos=b.dataset.p;$$('#pn-pos button').forEach(function(x){x.classList.toggle('on',x===b)});pnPrev()});
['pn-fmt','pn-start','pn-skip'].forEach(function(i){$('#'+i).addEventListener('input',pnPrev)});
$('#pn-size').addEventListener('input',function(){$('#pn-sz-o').textContent=this.value;pnPrev()});
window.addEventListener('resize',function(){if(!$('#p-pagenum .work').hidden)pnPrev()});
$('[data-act=clear]',nSec).onclick=function(){N.files=[];show(nSec,false)};
async function stamp(buf,o){
 var doc=await PDFLib.PDFDocument.load(buf),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),pages=doc.getPages(),total=pages.length,m=36;
 pages.forEach(function(pg,i){if(i<o.skip)return;var num=o.start+(i-o.skip),text=pnText(o.fmt,num,o.fmt==='n'||o.fmt==='dash'?total:o.start+total-o.skip-1);
  var mb=pg.getMediaBox(),w=mb.width,h=mb.height,r=((pg.getRotation().angle%360)+360)%360,W=r%180?h:w,H=r%180?w:h,tw=font.widthOfTextAtSize(text,o.size);
  var vx=o.pos[1]==='l'?m:o.pos[1]==='r'?W-m-tw:(W-tw)/2,vy=o.pos[0]==='t'?H-m-o.size*0.8:m-o.size*0.2+ 0;
  if(o.pos[0]==='b')vy=m-o.size*0.2;
  var x,y;if(r===0){x=vx;y=vy}else if(r===90){x=w-vy;y=vx}else if(r===180){x=w-vx;y=h-vy}else{x=vy;y=h-vx}
  pg.drawText(text,{x:mb.x+x,y:mb.y+y,size:o.size,font:font,color:PDFLib.rgb(.1,.1,.1),rotate:PDFLib.degrees(r)})});
 return {bytes:await doc.save(),pages:total};
}
$('#pn-go').onclick=async function(){
 if(!needQuota())return;busy(true,'处理中…');await tick();
 var o={pos:N.pos,fmt:$('#pn-fmt').value,start:Math.max(0,+$('#pn-start').value||0),skip:Math.max(0,+$('#pn-skip').value||0),size:+$('#pn-size').value};
 try{if(N.files.length===1){var f=N.files[0];if(o.skip>=f.pages){toast('跳过的页数不能大于等于总页数');return}var r=await stamp(f.buf,o);deliver(r.bytes,baseName(f.name)+'-页码.pdf',null,r.pages+' 页')}
  else{var out=[];for(var f2 of N.files){if(o.skip>=f2.pages)continue;var r2=await stamp(f2.buf,o);out.push({name:baseName(f2.name)+'-页码.pdf',data:r2.bytes})}await deliverZip(out,'批量页码.zip')}
 }catch(e){toast('处理失败：'+e.message)}finally{busy(false)}
};

/* ================= 图片转 PDF ================= */
var G={items:[]},gSec=$('#p-img');
function gRender(){
 var g=$('#img-grid');g.innerHTML='';
 G.items.forEach(function(it,i){var c=document.createElement('div');c.className='card';c.dataset.id=it.id;
  c.innerHTML='<div class="tw"><img class="img" alt=""></div><div class="meta"><span>'+(i+1)+'</span><span class="grip" title="拖动排序">'+GRIP+'</span></div><button class="ib del" data-a="rm" title="移除">'+I.x+'</button>';
  var im=$('img',c);im.src=it.url;im.style.cssText='width:100%;height:100%;object-fit:contain;box-shadow:none;background:none';g.appendChild(c)});
 $('#img-info').textContent=G.items.length+' 张图片';$('#img-go').disabled=!G.items.length;show(gSec,G.items.length>0);
}
function gAdd(files){
 var imgs=files.filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name)});
 if(imgs.length<files.length)toast('已忽略 '+(files.length-imgs.length)+' 个非图片文件');
 for(var f of imgs){
  if(!isPro()&&G.items.length>=FREE.imgs){openPro('免费版一次最多 '+FREE.imgs+' 张图片，其余的没有加入。');break}
  if(!isPro()&&f.size>FREE.bytes){openPro('「'+f.name+'」有 '+fmtSize(f.size)+'，免费版单文件限 20MB。');continue}
  G.items.push({id:nid(),file:f,name:f.name,url:URL.createObjectURL(f)})}
 gRender();
}
bindDrop('drop-img',gAdd);
$('#img-grid').addEventListener('click',function(e){var b=e.target.closest('[data-a=rm]');if(!b)return;var id=b.closest('.card').dataset.id,i=G.items.findIndex(function(x){return x.id===id});URL.revokeObjectURL(G.items[i].url);G.items.splice(i,1);gRender()});
sortable($('#img-grid'),'.card',function(ids){G.items=reorder(G.items,ids);gRender()});
$('[data-act=clear]',gSec).onclick=function(){G.items.forEach(function(i){URL.revokeObjectURL(i.url)});G.items=[];gRender()};
async function decodeImg(f){ // 解码并按 EXIF 摆正，再转成 PNG/JPEG 字节
 var bmp;try{bmp=await createImageBitmap(f,{imageOrientation:'from-image'})}catch(e){bmp=await createImageBitmap(f)}
 var w=bmp.width,h=bmp.height,mx=4200,s=Math.min(1,mx/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
 var x=c.getContext('2d'),png=/png|gif|webp|avif/i.test(f.type||f.name);
 if(!png){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
 var blob=await new Promise(function(r){c.toBlob(r,png?'image/png':'image/jpeg',.92)});
 return {bytes:new Uint8Array(await blob.arrayBuffer()),png:png,w:c.width,h:c.height};
}
$('#img-go').onclick=async function(){
 if(!needQuota())return;busy(true,'生成中…');await tick();
 try{var out=await PDFLib.PDFDocument.create(),sz=$('#img-size').value,mg=+$('#img-margin').value;
  for(var it of G.items){var d=await decodeImg(it.file),im=d.png?await out.embedPng(d.bytes):await out.embedJpg(d.bytes),pw,ph;
   if(sz==='fit'){var k=Math.min(1,1600/Math.max(d.w,d.h))*0.75;pw=d.w*k+mg*2;ph=d.h*k+mg*2}
   else{var base=sz==='a4'?[595.28,841.89]:[612,792];var land=d.w>d.h;pw=land?base[1]:base[0];ph=land?base[0]:base[1]}
   var pg=out.addPage([pw,ph]),aw=pw-mg*2,ah=ph-mg*2,s=Math.min(aw/d.w,ah/d.h),dw=d.w*s,dh=d.h*s;
   pg.drawImage(im,{x:(pw-dw)/2,y:(ph-dh)/2,width:dw,height:dh})}
  var bytes=await out.save();deliver(bytes,'图片合集-'+G.items.length+'张.pdf',null,G.items.length+' 页');
 }catch(e){toast('生成失败：'+(e.message||'图片无法解码'))}finally{busy(false)}
};

refreshTop();
mRender();gRender();
})();

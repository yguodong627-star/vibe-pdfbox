/* 页匠 v2：水印 / 签名签章 / PDF 转图片 / 压缩（重新渲染） */
(function(){
'use strict';
var PB=window.PB,$=PB.$,$$=PB.$$,PDFLib=window.PDFLib,rgb=PDFLib.rgb,degrees=PDFLib.degrees;
function hex2rgb(h){return rgb(parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255)}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
/* 视觉坐标（左下为原点、已含页面旋转）→ 原始页面坐标 */
function pageGeom(pg){
 var mb=pg.getMediaBox(),w=mb.width,h=mb.height,r=((pg.getRotation().angle%360)+360)%360,odd=r%180!==0;
 return {mb:mb,w:w,h:h,r:r,W:odd?h:w,H:odd?w:h,
  map:function(vx,vy){var x,y;if(r===0){x=vx;y=vy}else if(r===90){x=w-vy;y=vx}else if(r===180){x=w-vx;y=h-vy}else{x=vy;y=h-vx}return {x:mb.x+x,y:mb.y+y}}};
}
/* 以视觉中心 (cx,cy)、视觉逆时针角 theta 画一个 tw×th 的对象；返回原始坐标下的锚点（对象左下角）与角度 */
function anchor(g,cx,cy,tw,th,theta){
 var t=theta*Math.PI/180,ox=tw/2*Math.cos(t)-th/2*Math.sin(t),oy=tw/2*Math.sin(t)+th/2*Math.cos(t);
 var p=g.map(cx-ox,cy-oy);return {x:p.x,y:p.y,angle:theta+g.r};
}
/* 一个小的"当前页预览"组件 */
function Pager(o){ // o:{pv,prevBtn,nextBtn,label,onPage}
 var s={doc:null,n:1,total:1,go:function(n){
  if(n<1||n>s.total)return;s.n=n;$(o.label).textContent=n+' / '+s.total;
  return PB.drawPage(s.doc,n,$('canvas',$(o.pv)),o.width||360).then(function(){o.onPage&&o.onPage(n)})}};
 $(o.prevBtn).onclick=function(){s.go(s.n-1)};$(o.nextBtn).onclick=function(){s.go(s.n+1)};
 return s;
}
function loadOne(files,cb){
 files=PB.pickPdfs(files);if(!files.length)return Promise.resolve();
 PB.busy(true,'读取文件…');
 return PB.tick().then(function(){return PB.loadPdfFile(files[0])}).then(function(it){if(!it)return;return cb(it)})
  .catch(function(e){PB.toast('打开失败：'+(e&&e.message||e))}).then(function(){PB.busy(false)});
}
var LATIN=/^[\x20-\x7E\xA0-\xFF]*$/; // 标准 Helvetica(WinAnsi) 可表示

/* ================= 水印 ================= */
var W={f:null,pos:'mc',doc:null,pw:0,ph:0},wSec=$('#p-wm');
var wp=Pager({pv:'#wm-pv',prevBtn:'#wm-prev',nextBtn:'#wm-next',label:'#wm-pg',width:380,onPage:function(){wPrev()}});
function wOpts(){return {text:$('#wm-text').value.trim(),size:+$('#wm-size').value,op:+$('#wm-op').value/100,rot:+$('#wm-rot').value,color:$('#wm-color').value,pos:W.pos,tile:$('#wm-tile').checked,
 mode:document.querySelector('input[name=wmm]:checked').value,range:$('#wm-range').value}}
function wPrev(){
 var cv=$('#wm-pv canvas'),ov=$('#wm-ov'),o=wOpts();if(!W.f||!cv.clientWidth)return;
 var sc=cv.clientWidth/W.pw;ov.style.width=cv.clientWidth+'px';ov.style.height=cv.clientHeight+'px';ov.innerHTML='';
 var inRange=true;if(o.mode==='range'){var pr=PB.parseRanges(o.range,W.f.pages);inRange=!pr.err&&pr.ranges.some(function(r){return r.indexOf(wp.n)>=0})}
 ov.style.visibility=inRange?'visible':'hidden';
 var note=inRange?'':'当前页不在所选页范围内';$('#wm-note').textContent=note;
 if(!o.text)return;
 var mk=function(x,y){var s=document.createElement('span');s.textContent=o.text;s.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;font:'+(o.size*sc)+'px Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;color:'+o.color+';opacity:'+o.op+';transform:translate(-50%,-50%) rotate('+(-o.rot)+'deg)';ov.appendChild(s);return s};
 var w=cv.clientWidth,h=cv.clientHeight;
 if(o.tile){var tw=wMeasure(o)*sc,gx=tw*1.35,gy=o.size*sc*3.2,row=0;for(var y=gy/2;y<h+gy;y+=gy,row++)for(var x=(row%2?gx/2:0);x<w+gx;x+=gx)mk(x,y)}
 else{var m=Math.max(o.size*sc*0.6,18),fx=o.pos[1]==='l'?.2:o.pos[1]==='r'?.8:.5,fy=o.pos[0]==='t'?.12:o.pos[0]==='b'?.88:.5;mk(w*fx,h*fy)}
}
var mc=document.createElement('canvas').getContext('2d');
function wMeasure(o){mc.font=o.size+'px Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif';return mc.measureText(o.text).width}
['wm-text','wm-size','wm-op','wm-rot','wm-color','wm-tile','wm-range'].forEach(function(i){$('#'+i).addEventListener('input',function(){
 $('#wm-size-o').textContent=$('#wm-size').value;$('#wm-op-o').textContent=$('#wm-op').value;$('#wm-rot-o').textContent=$('#wm-rot').value;wPrev()})});
$('#wm-tile').addEventListener('change',wPrev);
$('#wm-pos').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;W.pos=b.dataset.p;$('#wm-tile').checked=false;$$('#wm-pos button').forEach(function(x){x.classList.toggle('on',x===b)});wPrev()});
$$('input[name=wmm]').forEach(function(r){r.onchange=function(){$('#wm-range').hidden=r.value!=='range'||!r.checked;wPrev()}});
PB.bindDrop('drop-wm',function(files){loadOne(files,function(it){
 W.f=it;if(W.doc)W.doc.destroy();return PB.pdfjsDoc(it.buf).then(function(d){W.doc=d;wp.doc=d;wp.total=it.pages;PB.show(wSec,true);
  return d.getPage(1)}).then(function(p){var v=p.getViewport({scale:1});W.pw=v.width;W.ph=v.height;$('#wm-info').textContent=it.name+' · '+it.pages+' 页';return wp.go(1)})})});
$('[data-act=clear]',wSec).onclick=function(){W.f=null;PB.show(wSec,false)};
function textPng(o){ // 非拉丁字符：渲染为透明 PNG（3 倍清晰度）
 var s=3,f=o.size*s+'px Helvetica,Arial,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';var c=document.createElement('canvas'),x=c.getContext('2d');
 x.font=f;var w=Math.ceil(x.measureText(o.text).width)+8*s,h=Math.ceil(o.size*s*1.35);c.width=w;c.height=h;x.font=f;x.fillStyle=o.color;x.textBaseline='middle';x.fillText(o.text,4*s,h/2);
 return new Promise(function(r){c.toBlob(function(b){b.arrayBuffer().then(function(ab){r({bytes:new Uint8Array(ab),w:w/s,h:h/s})})},'image/png')});
}
async function watermark(buf,o,pagesSel){
 var doc=await PDFLib.PDFDocument.load(buf),pages=doc.getPages(),latin=LATIN.test(o.text),font,tw,th,img,imgInfo;
 if(latin){font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);tw=font.widthOfTextAtSize(o.text,o.size);th=o.size*0.72}
 else{imgInfo=await textPng(o);img=await doc.embedPng(imgInfo.bytes);tw=imgInfo.w;th=imgInfo.h}
 var col=hex2rgb(o.color),count=0;
 pages.forEach(function(pg,i){
  if(pagesSel&&!pagesSel.has(i+1))return;var g=pageGeom(pg),spots=[];
  if(o.tile){var gx=tw*1.35,gy=o.size*3.2,row=0;for(var y=gy/2;y<g.H+gy;y+=gy,row++)for(var x=(row%2?gx/2:0);x<g.W+gx;x+=gx)spots.push([x,g.H-y])}
  else{var fx=o.pos[1]==='l'?.2:o.pos[1]==='r'?.8:.5,fy=o.pos[0]==='t'?.88:o.pos[0]==='b'?.12:.5;spots.push([g.W*fx,g.H*fy])}
  spots.forEach(function(s){
   if(o.tile&&(s[0]<-tw||s[0]>g.W+tw||s[1]<-th||s[1]>g.H+th))return;
   var a=anchor(g,s[0],s[1],tw,th,o.rot);
   if(latin)pg.drawText(o.text,{x:a.x,y:a.y,size:o.size,font:font,color:col,opacity:o.op,rotate:degrees(a.angle)});
   else pg.drawImage(img,{x:a.x,y:a.y,width:tw,height:th,opacity:o.op,rotate:degrees(a.angle)});
   count++})});
 return {bytes:await doc.save(),latin:latin,count:count};
}
$('#wm-go').onclick=async function(){
 var o=wOpts();if(!W.f)return;if(!o.text){PB.toast('请先输入水印文字');return}
 var sel=null;if(o.mode==='range'){var pr=PB.parseRanges(o.range,W.f.pages);if(pr.err||!pr.ranges.length){PB.toast(pr.err||'请填写页码范围');return}sel=new Set();pr.ranges.forEach(function(r){r.forEach(function(n){sel.add(n)})})}
 PB.busy(true,'添加水印…');await PB.tick();
 try{var r=await watermark(W.f.buf,o,sel);PB.deliver(r.bytes,PB.baseName(W.f.name)+'-水印.pdf',null,(sel?sel.size:W.f.pages)+' 页'+(r.latin?'':' · 中文水印为图片形式'))}
 catch(e){PB.toast('处理失败：'+e.message)}finally{PB.busy(false)}
};

/* ================= 签名签章 ================= */
var G={f:null,doc:null,pw:0,items:[],sel:null,sigUrl:null,sigW:0,sigH:0,drawn:false},gSec=$('#p-sign');
var gp=Pager({pv:'#sg-pv',prevBtn:'#sg-prev',nextBtn:'#sg-next',label:'#sg-pg',width:380,onPage:function(){gLayer()}});
var pad=$('#sg-pad'),pc=pad.getContext('2d'),drawing=false,strokes=[],cur=null;
function padRedraw(){pc.clearRect(0,0,pad.width,pad.height);pc.lineCap=pc.lineJoin='round';
 strokes.concat(cur?[cur]:[]).forEach(function(s){pc.strokeStyle=s.c;pc.lineWidth=s.w*2;pc.beginPath();s.p.forEach(function(p,i){if(i)pc.lineTo(p[0],p[1]);else pc.moveTo(p[0],p[1])});if(s.p.length===1)pc.lineTo(s.p[0][0]+.1,s.p[0][1]);pc.stroke()})}
function padPt(e){var r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height]}
pad.addEventListener('pointerdown',function(e){e.preventDefault();pad.setPointerCapture(e.pointerId);cur={c:$('#sg-pen').value,w:+$('#sg-w').value,p:[padPt(e)]};padRedraw()});
pad.addEventListener('pointermove',function(e){if(!cur)return;cur.p.push(padPt(e));padRedraw()});
function padEnd(){if(!cur)return;strokes.push(cur);cur=null;padRedraw()}
pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);
$('#sg-clear').onclick=function(){strokes=[];cur=null;padRedraw()};
$$('input[name=sgs]').forEach(function(r){r.onchange=function(){var d=document.querySelector('input[name=sgs]:checked').value==='draw';$('#sg-draw').hidden=!d;$('#sg-up').hidden=d}});
var upImg=null;
function upRefresh(){
 if(!upImg)return;var c=document.createElement('canvas'),m=Math.min(1,1200/Math.max(upImg.width,upImg.height));c.width=Math.round(upImg.width*m);c.height=Math.round(upImg.height*m);
 var x=c.getContext('2d');x.drawImage(upImg,0,0,c.width,c.height);
 if(!$('#sg-keyw').checked){var d=x.getImageData(0,0,c.width,c.height),a=d.data;for(var i=0;i<a.length;i+=4){var mn=Math.min(a[i],a[i+1],a[i+2]);if(a[i+3]&&mn>235){a[i+3]=0}else if(a[i+3]&&mn>190){a[i+3]=Math.round(a[i+3]*(235-mn)/45)}}x.putImageData(d,0,0)}
 upImg.canvas=c;$('#sg-thumb').src=c.toDataURL('image/png');
}
$('#sg-keyw').onchange=upRefresh;
$('#sg-file').onchange=function(){var f=this.files[0];this.value='';if(!f)return;createImageBitmap(f).then(function(b){upImg=b;upRefresh()}).catch(function(){PB.toast('图片无法读取')})};
function trim(c){ // 裁掉透明边，得到紧凑 PNG
 var x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data,x0=c.width,y0=c.height,x1=-1,y1=-1;
 for(var y=0;y<c.height;y++)for(var xx=0;xx<c.width;xx++)if(d[(y*c.width+xx)*4+3]>8){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(y<y0)y0=y;if(y>y1)y1=y}
 if(x1<0)return null;var p=6;x0=Math.max(0,x0-p);y0=Math.max(0,y0-p);x1=Math.min(c.width-1,x1+p);y1=Math.min(c.height-1,y1+p);
 var o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height);return o;
}
function currentSig(){
 var drawMode=document.querySelector('input[name=sgs]:checked').value==='draw',src;
 if(drawMode){if(!strokes.length){PB.toast('请先在画布上手写签名');return null}src=pad}
 else{if(!upImg||!upImg.canvas){PB.toast('请先选择签名/印章图片');return null}src=upImg.canvas}
 var t=trim(src);if(!t){PB.toast('签名内容为空');return null}return t;
}
$('#sg-add').onclick=function(){
 var t=currentSig();if(!t)return;
 var wf=Math.min(.3,Math.max(.12,t.width/ (G.pw*2.2)));wf=.25;
 var it={id:'s'+Math.random().toString(36).slice(2),page:gp.n,canvas:t,ar:t.height/t.width,x:.5,y:.5,w:wf,url:t.toDataURL('image/png')};
 G.items.push(it);G.sel=it.id;gLayer();
};
function gLayer(){
 var L=$('#sg-layer'),cv=$('#sg-pv canvas');L.style.width=cv.clientWidth+'px';L.style.height=cv.clientHeight+'px';L.innerHTML='';
 G.items.filter(function(i){return i.page===gp.n}).forEach(function(it){
  var im=document.createElement('img');im.src=it.url;im.className='sg-it'+(it.id===G.sel?' on':'');im.dataset.id=it.id;im.draggable=false;
  im.style.width=(it.w*100)+'%';im.style.left=(it.x*100)+'%';im.style.top=(it.y*100)+'%';L.appendChild(im)});
 var s=G.items.find(function(i){return i.id===G.sel});
 $('#sg-sel').hidden=!s;if(s){$('#sg-sz').value=Math.round(s.w*100);$('#sg-sz-o').textContent=Math.round(s.w*100)+'% 页宽'}
 $('#sg-hint').textContent='在页面上拖动签名到合适位置。已放置：'+G.items.length+' 个（共 '+(new Set(G.items.map(function(i){return i.page})).size)+' 页）。';
}
$('#sg-layer').addEventListener('pointerdown',function(e){
 var im=e.target.closest('.sg-it');if(!im)return;e.preventDefault();var it=G.items.find(function(i){return i.id===im.dataset.id});G.sel=it.id;
 $$('.sg-it').forEach(function(x){x.classList.toggle('on',x===im)});$('#sg-sel').hidden=false;$('#sg-sz').value=Math.round(it.w*100);$('#sg-sz-o').textContent=Math.round(it.w*100)+'% 页宽';
 var L=$('#sg-layer'),r=L.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=it.x,oy=it.y;
 var mv=function(ev){it.x=Math.min(1,Math.max(0,ox+(ev.clientX-sx)/r.width));it.y=Math.min(1,Math.max(0,oy+(ev.clientY-sy)/r.height));im.style.left=it.x*100+'%';im.style.top=it.y*100+'%'};
 var up=function(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)};
 window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
});
$('#sg-sz').addEventListener('input',function(){var it=G.items.find(function(i){return i.id===G.sel});if(!it)return;it.w=+this.value/100;$('#sg-sz-o').textContent=this.value+'% 页宽';gLayer()});
$('#sg-del').onclick=function(){G.items=G.items.filter(function(i){return i.id!==G.sel});G.sel=null;gLayer()};
PB.bindDrop('drop-sign',function(files){loadOne(files,function(it){
 G.f=it;G.items=[];G.sel=null;if(G.doc)G.doc.destroy();return PB.pdfjsDoc(it.buf).then(function(d){G.doc=d;gp.doc=d;gp.total=it.pages;PB.show(gSec,true);return d.getPage(1)})
  .then(function(p){G.pw=p.getViewport({scale:1}).width;$('#sg-info').textContent=it.name+' · '+it.pages+' 页';return gp.go(1)})})});
$('[data-act=clear]',gSec).onclick=function(){G.f=null;G.items=[];PB.show(gSec,false)};
async function embedSigs(buf,items){
 var doc=await PDFLib.PDFDocument.load(buf),pages=doc.getPages(),cache={};
 for(var it of items){
  var img=cache[it.id]||(cache[it.id]=await doc.embedPng(await new Promise(function(r){it.canvas.toBlob(function(b){b.arrayBuffer().then(function(a){r(new Uint8Array(a))})},'image/png')})));
  var pg=pages[it.page-1],g=pageGeom(pg),tw=it.w*g.W,th=tw*it.ar;
  var cx=it.x*g.W,cy=g.H-it.y*g.H; // it.x/y 为图片中心占页面的比例（CSS 以中心定位）
  var a=anchor(g,cx,cy,tw,th,0);
  pg.drawImage(img,{x:a.x,y:a.y,width:tw,height:th,rotate:degrees(a.angle)});
 }
 return doc.save();
}
$('#sg-go').onclick=async function(){
 if(!G.items.length){PB.toast('还没有放置签名：先手写或上传，再点“放到当前页”');return}
 PB.busy(true,'嵌入签名…');await PB.tick();
 try{var b=await embedSigs(G.f.buf,G.items);PB.deliver(b,PB.baseName(G.f.name)+'-已签名.pdf',null,G.items.length+' 处签名')}
 catch(e){PB.toast('处理失败：'+e.message)}finally{PB.busy(false)}
};

/* ================= PDF 转图片 ================= */
var T={f:null,doc:null},tSec=$('#p-toimg'),MAXSIDE=8000,MAXPX=60e6;
function tFmtChange(){$('#ti-qw').hidden=$('#ti-fmt').value!=='jpg'}
$('#ti-fmt').onchange=tFmtChange;$('#ti-q').oninput=function(){$('#ti-q-o').textContent=this.value};
async function tCheck(){ // 提示将被限制分辨率的页面
 if(!T.doc)return;var dpi=+$('#ti-dpi').value,p=await T.doc.getPage(1),v=p.getViewport({scale:1}),k=dpi/72,w=v.width*k,h=v.height*k;
 $('#ti-note').textContent='第 1 页将输出约 '+Math.round(w)+'×'+Math.round(h)+' 像素。'+((w>MAXSIDE||h>MAXSIDE||w*h>MAXPX)?'超出浏览器安全上限，会自动降低分辨率。':'');
}
$('#ti-dpi').onchange=tCheck;
PB.bindDrop('drop-toimg',function(files){loadOne(files,function(it){T.f=it;if(T.doc)T.doc.destroy();return PB.pdfjsDoc(it.buf).then(function(d){T.doc=d;PB.show(tSec,true);$('#ti-info').textContent=it.name+' · '+it.pages+' 页';tFmtChange();return tCheck()})})});
$('[data-act=clear]',tSec).onclick=function(){T.f=null;PB.show(tSec,false)};
async function renderPage(doc,n,dpi,type,q){
 var p=await doc.getPage(n),v=p.getViewport({scale:1}),k=dpi/72,lim=Math.min(MAXSIDE/Math.max(v.width,v.height),Math.sqrt(MAXPX/(v.width*v.height)));
 var eff=Math.min(k,lim),vp=p.getViewport({scale:eff}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
 var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await p.render({canvasContext:x,viewport:vp}).promise;
 var blob=await new Promise(function(r){c.toBlob(r,type,q)});if(!blob)throw new Error('第 '+n+' 页太大，浏览器无法生成图片，请降低分辨率');
 var out={bytes:new Uint8Array(await blob.arrayBuffer()),w:c.width,h:c.height,pw:v.width,ph:v.height,limited:eff<k-1e-6,canvas:null};c.width=c.height=0;return out;
}
$('#ti-go').onclick=async function(){
 if(!T.f)return;var n=T.f.pages,pages=[],rg=$('#ti-range').value.trim();
 if(rg){var pr=PB.parseRanges(rg,n);if(pr.err){PB.toast(pr.err);return}var s=new Set();pr.ranges.forEach(function(r){r.forEach(function(i){s.add(i)})});pages=Array.from(s).sort(function(a,b){return a-b})}
 else for(var i=1;i<=n;i++)pages.push(i);
 var fmt=$('#ti-fmt').value,dpi=+$('#ti-dpi').value,type=fmt==='png'?'image/png':'image/jpeg',q=+$('#ti-q').value/100,base=PB.baseName(T.f.name),files=[],lim=false;
 PB.busy(true,'渲染中…');
 try{for(var k=0;k<pages.length;k++){$('#busy-t').textContent='渲染第 '+pages[k]+' 页（'+(k+1)+'/'+pages.length+'）…';await sleep(10);
   var r=await renderPage(T.doc,pages[k],dpi,type,q);lim=lim||r.limited;files.push({name:base+'-第'+String(pages[k]).padStart(String(n).length,'0')+'页.'+fmt,data:r.bytes})}
  if(files.length===1)PB.deliver(files[0].data,files[0].name,type,(lim?'已自动降低分辨率 · ':'')+dpi+' DPI');
  else await PB.deliverZip(files,base+'-图片.zip');
  if(lim)PB.toast('部分页面超出浏览器上限，已自动降低分辨率');
 }catch(e){PB.toast('转换失败：'+e.message)}finally{PB.busy(false)}
};

/* ================= 压缩（重新渲染） ================= */
var C={f:null,doc:null},cSec=$('#p-compress');
PB.bindDrop('drop-compress',function(files){loadOne(files,function(it){C.f=it;if(C.doc)C.doc.destroy();return PB.pdfjsDoc(it.buf).then(function(d){C.doc=d;PB.show(cSec,true);$('#cp-info').textContent=it.name+' · '+it.pages+' 页 · '+PB.fmtSize(it.size);$('#cp-res').textContent=''})})});
$('[data-act=clear]',cSec).onclick=function(){C.f=null;PB.show(cSec,false)};
$('#cp-go').onclick=async function(){
 if(!C.f)return;var lv=$('#cp-lv').value.split(','),dpi=+lv[0],q=+lv[1];PB.busy(true,'渲染中…');
 try{var out=await PDFLib.PDFDocument.create();
  for(var n=1;n<=C.f.pages;n++){$('#busy-t').textContent='渲染第 '+n+' / '+C.f.pages+' 页…';await sleep(10);
   var r=await renderPage(C.doc,n,dpi,'image/jpeg',q),im=await out.embedJpg(r.bytes),pg=out.addPage([r.pw,r.ph]);pg.drawImage(im,{x:0,y:0,width:r.pw,height:r.ph})}
  var bytes=await out.save(),a=C.f.size,b=bytes.length,pct=Math.round((1-b/a)*100);
  $('#cp-res').textContent=b<a?'体积 '+PB.fmtSize(a)+' → '+PB.fmtSize(b)+'（减少 '+pct+'%）':'体积 '+PB.fmtSize(a)+' → '+PB.fmtSize(b)+'：反而变大了，建议保留原文件';
  PB.deliver(bytes,PB.baseName(C.f.name)+'-压缩.pdf',null,'已转为图片页 · '+(b<a?'减少 '+pct+'%':'体积变大'));
 }catch(e){PB.toast('处理失败：'+e.message)}finally{PB.busy(false)}
};
window.__pbTools={watermark:watermark,embedSigs:embedSigs,W:W,G:G};
})();

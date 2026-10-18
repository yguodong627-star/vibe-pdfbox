// v2 新功能自测：python3 -m http.server 8768 & ; NODE_PATH=/workspace/tools/node_modules node tests/features.js
// 依赖：puppeteer-core、本机 Chrome、Pillow、poppler-utils（pdftoppm/pdfinfo/pdftotext）、unzip
const puppeteer = require('puppeteer-core'), { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const URL_ = process.env.URL || 'http://localhost:8768/index.html';
let fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m); if (!c) fail++; };
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 28 });
const py = code => sh(`python3 - <<'PYEOF'\n${code}\nPYEOF`);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-')), dl = path.join(dir, 'dl'); fs.mkdirSync(dl);
  // 样例：3 页文字 PDF（第 3 页 /Rotate 90，第 2 页 Letter 尺寸）
  const { PDFDocument, StandardFonts, degrees } = require(path.resolve(__dirname, '../vendor/pdf-lib.min.js'));
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  [[595, 842], [612, 792], [595, 842]].forEach((s, i) => { const p = d.addPage(s); p.drawText('Sample page ' + (i + 1), { x: 40, y: s[1] - 60, size: 14, font: f }); if (i === 2) p.setRotation(degrees(90)); });
  fs.writeFileSync(dir + '/text.pdf', await d.save());
  py(`
from PIL import Image, ImageFilter
import random
random.seed(1)
pgs=[]
for i in range(3):
    im=Image.effect_noise((1700,2200),60).convert('RGB').filter(ImageFilter.GaussianBlur(1.2))
    pgs.append(im)
pgs[0].save('${dir}/scan.pdf',save_all=True,append_images=pgs[1:],quality=97,resolution=200)
im=Image.new('RGBA',(300,160),(255,255,255,255))
from PIL import ImageDraw
dr=ImageDraw.Draw(im); dr.ellipse((10,10,150,150),outline=(200,20,20,255),width=10); dr.text((60,70),'STAMP',fill=(200,20,20,255))
im.save('${dir}/stamp.png')
`);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const cdp = await b.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1000 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const reqs = []; p.on('request', r => { const u = r.url(); if (!/^(http:\/\/localhost|data:|blob:)/.test(u)) reqs.push(u) });
  await p.goto(URL_, { waitUntil: 'networkidle0' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nth = () => fs.readdirSync(dl).filter(x => !x.endsWith('.crdownload'));
  const take = async (act) => { nth().forEach(x => fs.unlinkSync(path.join(dl, x))); const before = new Set(nth()); await act(); for (let i = 0; i < 400; i++) { await sleep(100); const n = nth().filter(x => !before.has(x)); if (n.length) { await sleep(150); return path.join(dl, n[0]) } } throw new Error('没有下载') };
  const tab = async t => { await p.click(`#tabs button[data-tool=${t}]`); await sleep(250) };
  const render = (pdf, pg, out, dpi = 60) => { sh(`pdftoppm -r ${dpi} -f ${pg} -l ${pg} -png -singlefile "${pdf}" "${out}"`); return out + '.png' };
  // 统计：与原图相比发生变化的像素 → 包围盒、质心（占页面比例）
  const diff = (a, b) => JSON.parse(py(`
from PIL import Image, ImageChops
import json
A=Image.open('${a}').convert('RGB'); B=Image.open('${b}').convert('RGB')
d=ImageChops.difference(A,B).convert('L').point(lambda v:255 if v>12 else 0)
bb=d.getbbox(); W,H=A.size
px=d.load(); xs=ys=n=0
for y in range(H):
    for x in range(W):
        if px[x,y]: xs+=x; ys+=y; n+=1
print(json.dumps({'n':n,'bb':bb,'W':W,'H':H,'cx':(xs/n/W if n else None),'cy':(ys/n/H if n else None),'sameSize':A.size==B.size}))
`));
  /* ---------- 水印 ---------- */
  console.log('水印');
  await tab('wm'); await (await p.$('#drop-wm input')).uploadFile(dir + '/text.pdf');
  await p.waitForFunction(() => /3 页/.test(document.querySelector('#wm-info').textContent), { timeout: 30000 }); await sleep(600);
  const setR = async (sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })) }, v);
  await p.$eval('#wm-text', e => e.value = ''); await p.type('#wm-text', 'CONFIDENTIAL');
  await setR('#wm-rot', 0); await setR('#wm-op', 60); await setR('#wm-size', 60);
  let out = await take(() => p.click('#wm-go'));
  ok(/-水印\.pdf$/.test(out), '下载文件名 ' + path.basename(out));
  ok(/Pages:\s+3/.test(sh(`pdfinfo "${out}"`)), 'pdfinfo 页数仍为 3');
  let txt = sh(`pdftotext -layout "${out}" -`); const pgs = txt.split('\f');
  ok([0, 1, 2].every(i => pgs[i].includes('CONFIDENTIAL')), 'pdftotext：三页都含 CONFIDENTIAL（真文字）');
  ok(txt.includes('Sample page 1'), '原文字仍在');
  for (const [pg, name] of [[1, 'A4'], [2, 'Letter'], [3, '旋转90页']]) {
    const o = render(out, pg, dir + '/wm' + pg), r0 = render(dir + '/text.pdf', pg, dir + '/o' + pg), r = diff(r0, o);
    const bw = r.bb[2] - r.bb[0], bh = r.bb[3] - r.bb[1];
    ok(r.n > 200 && Math.abs(r.cx - .5) < .03 && Math.abs(r.cy - .5) < .03, `${name} 水印居中：质心 (${r.cx.toFixed(3)}, ${r.cy.toFixed(3)}) 像素 ${r.n}`);
    ok(bw > bh * 2.5, `${name} 0° 水印呈横向（视觉方向正确）：${bw}×${bh}`);
  }
  // 45° 旋转：包围盒近似正方形 + 指定页
  await setR('#wm-rot', 45); await p.click('#wm-mode input[value=range]'); await p.$eval('#wm-range', e => e.value = ''); await p.type('#wm-range', '2');
  out = await take(() => p.click('#wm-go')).catch(async e => { console.log('toast:', await p.$eval('#toast', t => t.textContent), await p.$eval('#wm-range', t => t.hidden + '/' + t.value)); throw e }); txt = sh(`pdftotext -layout "${out}" -`).split('\f');
  console.log('   45° pdftotext:',JSON.stringify(txt.map(t=>t.replace(/\s+/g,' ').slice(0,80))));const clean = t => t.replace(/\s+/g, ' ').trim(); ok(clean(txt[0]) === 'Sample page 1' && clean(txt[2]) === 'Sample page 3' && clean(txt[1]).length > 'Sample page 2'.length + 8, '指定页 "2"：只有第 2 页多出水印字符（45° 文字 pdftotext 会拆成碎片）');
  { const r = diff(render(dir + '/text.pdf', 2, dir + '/o2'), render(out, 2, dir + '/w45')); const bw = r.bb[2] - r.bb[0], bh = r.bb[3] - r.bb[1];
    ok(bw / bh > .6 && bw / bh < 1.6 && Math.abs(r.cy - .5) < .03, '45° 水印包围盒接近方形 ' + bw + '×' + bh);
    const o1 = diff(render(dir + '/text.pdf', 1, dir + '/o1'), render(out, 1, dir + '/w451')); ok(o1.n === 0, '未选中的第 1 页像素不变'); }
  // 左上位置 + 透明度
  await p.click('#wm-mode input[value=all]'); await p.click('#wm-pos button[data-p=tl]'); await setR('#wm-rot', 0); await setR('#wm-op', 100);
  out = await take(() => p.click('#wm-go')); { const r = diff(render(dir + '/text.pdf', 1, dir + '/o1'), render(out, 1, dir + '/wtl')); ok(r.cx < .45 && r.cy < .3, `左上位置：质心 (${r.cx.toFixed(2)},${r.cy.toFixed(2)})`) }
  // 平铺
  await p.click('#wm-tile'); await setR('#wm-size', 30); out = await take(() => p.click('#wm-go'));
  ok((sh(`pdftotext "${out}" -`).match(/CONFIDENTIAL/g) || []).length >= 12, '平铺：全文出现多次水印 ' + (sh(`pdftotext "${out}" -`).match(/CONFIDENTIAL/g) || []).length);
  // 中文水印 → 图片
  await p.click('#wm-tile'); await p.click('#wm-pos button[data-p=mc]'); await p.$eval('#wm-text', e => e.value = ''); await p.type('#wm-text', '内部资料'); await setR('#wm-size', 60); await setR('#wm-rot', 0);
  out = await take(() => p.click('#wm-go')); { const r = diff(render(dir + '/text.pdf', 1, dir + '/o1'), render(out, 1, dir + '/wcn')); ok(r.n > 200 && Math.abs(r.cx - .5) < .03, '中文水印以图片嵌入且居中：像素 ' + r.n); ok(/中文水印为图片/.test(await p.$eval('#result-t', e => e.textContent)), '界面如实提示中文水印为图片形式') }
  await p.screenshot({ path: path.join(__dirname, '../screenshots/10-desktop-wm.png') });

  /* ---------- 签名 ---------- */
  console.log('签名签章');
  await tab('sign'); await (await p.$('#drop-sign input')).uploadFile(dir + '/text.pdf');
  await p.waitForFunction(() => /3 页/.test(document.querySelector('#sg-info').textContent), { timeout: 30000 }); await sleep(600);
  const pad = await p.$('#sg-pad'), pb = await pad.boundingBox();
  await p.mouse.move(pb.x + 30, pb.y + pb.height * .6); await p.mouse.down();
  for (let i = 0; i <= 30; i++) await p.mouse.move(pb.x + 30 + i * 10, pb.y + pb.height * (.6 + .25 * Math.sin(i / 3)), { steps: 2 });
  await p.mouse.up();
  await p.click('#sg-add'); await sleep(200);
  const dragTo = async (fx, fy) => { const im = await p.$('#sg-layer .sg-it.on'), ib = await im.boundingBox(), cv = await (await p.$('#sg-pv canvas')).boundingBox();
    await p.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await p.mouse.down(); await p.mouse.move(cv.x + cv.width * fx, cv.y + cv.height * fy, { steps: 8 }); await p.mouse.up(); };
  await dragTo(.7, .8); await sleep(150);
  const sw = await p.$eval('#sg-layer .sg-it.on', e => e.getBoundingClientRect().width / document.querySelector('#sg-pv canvas').getBoundingClientRect().width);
  await setR('#sg-sz', 30);
  ok(/已放置：1 个/.test(await p.$eval('#sg-hint', e => e.textContent)), '提示已放置 1 个');
  // 第 3 页（旋转）再放一个
  await p.click('#sg-next'); await sleep(500); await p.click('#sg-next'); await sleep(600); await p.click('#sg-add'); await sleep(200); await dragTo(.3, .25); await sleep(150);
  out = await take(() => p.click('#sg-go'));
  ok(/Pages:\s+3/.test(sh(`pdfinfo "${out}"`)), '签名后页数不变');
  { const r = diff(render(dir + '/text.pdf', 1, dir + '/o1'), render(out, 1, dir + '/s1')); ok(r.n > 150 && Math.abs(r.cx - .7) < .04 && Math.abs(r.cy - .8) < .05, `A4 签名落在拖放位置 (0.70,0.80)：实际 (${r.cx.toFixed(3)}, ${r.cy.toFixed(3)})`) }
  { const r = diff(render(dir + '/text.pdf', 3, dir + '/o3'), render(out, 3, dir + '/s3')); ok(r.n > 150 && Math.abs(r.cx - .3) < .04 && Math.abs(r.cy - .25) < .05, `旋转页签名落在拖放位置 (0.30,0.25)：实际 (${r.cx.toFixed(3)}, ${r.cy.toFixed(3)})`) }
  { const r = diff(render(dir + '/text.pdf', 2, dir + '/o2'), render(out, 2, dir + '/s2')); ok(r.n === 0, '未放置的第 2 页保持不变') }
  await p.screenshot({ path: path.join(__dirname, '../screenshots/11-desktop-sign.png') });
  // 图片印章
  await p.click('#sg-src input[value=img]'); await (await p.$('#sg-file')).uploadFile(dir + '/stamp.png'); await sleep(500);
  await p.click('#sg-prev'); await sleep(500); await p.click('#sg-prev'); await sleep(500); await p.click('#sg-add'); await sleep(200); await dragTo(.5, .5);
  out = await take(() => p.click('#sg-go'));
  { const r = diff(render(dir + '/text.pdf', 1, dir + '/o1'), render(out, 1, dir + '/s1b', 100)); ok(r.n > 300, '印章图片已嵌入第 1 页，像素 ' + r.n) }

  /* ---------- 转图片 ---------- */
  console.log('PDF 转图片');
  await tab('toimg'); await (await p.$('#drop-toimg input')).uploadFile(dir + '/text.pdf');
  await p.waitForFunction(() => /3 页/.test(document.querySelector('#ti-info').textContent), { timeout: 30000 });
  await p.select('#ti-dpi', '150'); out = await take(() => p.click('#ti-go'));
  ok(/\.zip$/.test(out), '多页打 ZIP：' + path.basename(out));
  py(`import zipfile\nzipfile.ZipFile('${out}').extractall('${dir}/z')`); const zf = fs.readdirSync(dir + '/z').sort(); ok(zf.length === 3 && zf.every(n => /\.png$/.test(n)), 'ZIP 含 3 张 PNG：' + zf.join(','));
  const sizes = zf.map(n => py(`from PIL import Image\nprint(*Image.open('${dir}/z/${n}').size)`).trim());
  ok(sizes[0] === '1240 1754', 'A4@150DPI = 1240×1754，实际 ' + sizes[0]);
  ok(sizes[1] === '1275 1650', 'Letter@150DPI = 1275×1650，实际 ' + sizes[1]);
  ok(sizes[2] === '1754 1240', '旋转 90 页方向正确（横向）= 1754×1240，实际 ' + sizes[2]);
  ok(/Sample page 1/.test('') || py(`from PIL import Image\nim=Image.open('${dir}/z/${zf[0]}').convert('L')\nprint(sum(1 for x in range(60,400) for y in range(100,170) if im.getpixel((x,y))<100))`).trim() > 50, '第 1 页左上文字区有深色像素（内容已渲染）');
  await p.select('#ti-fmt', 'jpg'); await p.select('#ti-dpi', '72'); await p.$eval('#ti-range', e => e.value = ''); await p.type('#ti-range', '2');
  out = await take(() => p.click('#ti-go'));
  ok(/第2页\.jpg$/.test(out), '单页直出 JPG：' + path.basename(out));
  ok(py(`from PIL import Image\nim=Image.open('${out}')\nprint(im.format,im.size)`).trim() === "JPEG (612, 792)", 'JPG 为 612×792（Letter@72DPI）');
  await p.$eval('#ti-range', e => e.value = ''); await p.type('#ti-range', '9');
  await p.click('#ti-go'); await sleep(500); ok(/超出范围/.test(await p.$eval('#toast', e => e.textContent)), '页码越界有提示');

  /* ---------- 压缩 ---------- */
  console.log('压缩（重新渲染）');
  await tab('compress'); ok((await p.$eval('#p-compress .warn', e => e.textContent)).includes('文字不再可选'), '页面明确警告文字不可选');
  await (await p.$('#drop-compress input')).uploadFile(dir + '/scan.pdf');
  await p.waitForFunction(() => /3 页/.test(document.querySelector('#cp-info').textContent), { timeout: 30000 });
  const orig = fs.statSync(dir + '/scan.pdf').size; await p.select('#cp-lv', '96,0.6');
  out = await take(() => p.click('#cp-go')); const nz = fs.statSync(out).size;
  ok(nz < orig * .6, `扫描类 PDF 体积 ${(orig / 1024) | 0}KB → ${(nz / 1024) | 0}KB`);
  const o2 = sh(`pdfinfo "${out}"`); ok(/Pages:\s+3/.test(o2), '页数 3 保持'); ok(sh(`pdftotext "${out}" -`).trim() === '', '确认无可选文字（如实）');
  ok(/减少/.test(await p.$eval('#cp-res', e => e.textContent)), '界面显示前后体积：' + await p.$eval('#cp-res', e => e.textContent));
  await p.click('#p-compress [data-act=clear]'); await (await p.$('#drop-compress input')).uploadFile(dir + '/text.pdf');
  await p.waitForFunction(() => /text\.pdf/.test(document.querySelector('#cp-info').textContent)); await p.select('#cp-lv', '170,0.82');
  out = await take(() => p.click('#cp-go')); ok(/变大/.test(await p.$eval('#cp-res', e => e.textContent)), '纯文字 PDF 压缩后变大时如实提示：' + await p.$eval('#cp-res', e => e.textContent));

  ok(reqs.length === 0, '无任何外部/上传请求 ' + reqs.join(','));
  ok(errs.length === 0, '无脚本错误 ' + errs.join(';'));
  await b.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? '失败 ' + fail : '全部通过'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

// 自测：先 python3 -m http.server 8768 &，再 node tests/smoke.js（需 puppeteer-core、本机 Chrome、Pillow）
const puppeteer = require('puppeteer-core'), { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const URL_ = process.env.URL || 'http://localhost:8768/index.html';
let fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m); if (!c) fail++; };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  execSync(`python3 -c "
from PIL import Image
import random
for i in range(8):
    pages=[Image.new('RGB',(600,800),(30*i%255,100,200-10*i)) for _ in range(3)]
    pages[0].save('${dir}/a%d.pdf'%i,save_all=True,append_images=pages[1:])
# 超过 20MB 的 PDF（原免费版会拦）
big=[Image.frombytes('RGB',(3000,2400),random.randbytes(3000*2400*3)) for _ in range(4)]
big[0].save('${dir}/big.pdf',save_all=True,append_images=big[1:],quality=98)
for i in range(25): Image.new('RGB',(400,300),(i*9,80,160)).save('${dir}/i%02d.png'%i)
"`);
  const size = fs.statSync(path.join(dir, 'big.pdf')).size;
  const pdfs = [...Array(8).keys()].map(i => path.join(dir, `a${i}.pdf`)), imgs = [...Array(25).keys()].map(i => path.join(dir, `i${String(i).padStart(2, '0')}.png`));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL_, { waitUntil: 'networkidle0' });
  const html0 = await p.evaluate(() => document.documentElement.outerHTML);
  ok(!/Pro\b|授权码|付费|收费|解锁|今日剩余|免费版/.test(html0), '页面不含 Pro/授权码/付费/解锁/免费版限额字样');
  ok(!(await p.$('#proBtn')) && !(await p.$('#usage')) && !(await p.$('#modal')) && !(await p.$('#m-key')), '无 Pro 按钮/用量/弹窗/授权码输入');
  ok(html0.includes('完全免费'), '页面标明完全免费');
  const res = () => p.$eval('#result-t', e => e.textContent);
  const waitRes = async (prev) => { await p.waitForFunction((x) => { const r = document.querySelector('#result'); return !r.hidden && document.querySelector('#result-t').textContent !== x; }, { timeout: 90000 }, prev); return res(); };
  // 合并：8 个文件（原限 5），连续导出 12 次（原限每天 10 次）
  await (await p.$('#drop-merge input')).uploadFile(...pdfs);
  await p.waitForFunction(() => document.querySelectorAll('#merge-list > *').length === 8, { timeout: 30000 }).catch(() => {});
  const mc = await p.$$eval('#merge-list > *', e => e.length);
  ok(mc === 8, '一次合并 8 个文件无个数限制，实际 ' + mc);
  let last = '', names = new Set();
  for (let i = 0; i < 12; i++) { await p.evaluate(() => { document.querySelector('#result').hidden = true; document.querySelector('#result-t').textContent = ''; }); await p.click('#merge-go'); last = await waitRes(''); names.add(last); }
  ok(/合并-8个文件\.pdf/.test(last) && /24 页/.test(last), '连续导出 12 次仍可用，最后结果：' + last);
  // 拆分：大文件 + 每页一个文件（原 Pro）
  await p.click('#tabs button[data-tool=split]');
  await (await p.$('#drop-split input')).uploadFile(path.join(dir, 'big.pdf'));
  await p.waitForFunction(() => document.querySelectorAll('#split-grid .card').length > 0, { timeout: 60000 });
  ok(size > 20 * 1024 * 1024, '测试 PDF 大小 ' + (size / 1048576).toFixed(1) + 'MB > 20MB，已成功载入');
  await p.click('#split-mode input[value=each]');
  ok(await p.$eval('#split-mode input[value=each]', e => e.checked), '“每页一个文件”可直接选中');
  await p.click('#p-split .chips button[data-q=all]');
  await p.click('#split-go'); const z = await waitRes('');
  ok(/\.zip/.test(z) && /4 个文件/.test(z), '逐页拆分打包 ZIP：' + z);
  // 页码：批量多个文件（原 Pro）
  await p.click('#tabs button[data-tool=pagenum]');
  await (await p.$('#drop-pagenum input')).uploadFile(pdfs[0], pdfs[1], pdfs[2]);
  await p.waitForFunction(() => /批量/.test(document.querySelector('#pn-info').textContent), { timeout: 30000 });
  await p.evaluate(() => { document.querySelector('#result').hidden = true; });
  await p.click('#pn-go'); const pz = await waitRes('');
  ok(/\.zip/.test(pz) && /3 个文件/.test(pz), '批量加页码打包 ZIP：' + pz);
  // 图片转 PDF：25 张（原限 20）
  await p.click('#tabs button[data-tool=img]');
  await (await p.$('#drop-img input')).uploadFile(...imgs);
  await p.waitForFunction(() => document.querySelectorAll('#img-grid > *').length === 25, { timeout: 30000 }).catch(() => {});
  const ic = await p.$$eval('#img-grid > *', e => e.length); ok(ic === 25, '图片 25 张全部加入，实际 ' + ic);
  await p.evaluate(() => { document.querySelector('#result').hidden = true; });
  await p.click('#img-go'); const ir = await waitRes('');
  ok(/图片合集-25张\.pdf/.test(ir), '25 张图转 PDF：' + ir);
  ok(await p.evaluate(() => !localStorage.getItem('pdfbox.use') && !localStorage.getItem('pdfbox.key')), '不再读写用量/授权存储');
  ok(errs.length === 0, '无脚本错误 ' + errs.join(';'));
  await b.close(); fs.rmSync(dir, { recursive: true });
  console.log(fail ? '失败 ' + fail : '全部通过'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

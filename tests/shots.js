// 生成 screenshots/：python3 -m http.server 8768 & ; node tests/shots.js（示例文件为程序生成的虚构内容）
const puppeteer = require('puppeteer-core'), { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const URL_ = process.env.URL || 'http://localhost:8768/index.html';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbs-'));
  execSync(`python3 -c "
from PIL import Image, ImageDraw, ImageFont
def mk(name, n, title, col):
    pages=[]
    for i in range(n):
        im=Image.new('RGB',(794,1123),'white'); d=ImageDraw.Draw(im)
        d.rectangle((60,60,734,120),fill=col); d.text((80,80),'%s  P%d'%(title,i+1),fill='white')
        for k in range(14): d.rectangle((80,180+k*50,714-(k%3)*90,196+k*50),fill=(215,215,210))
        pages.append(im)
    pages[0].save('${dir}/'+name,save_all=True,append_images=pages[1:])
mk('合同.pdf',3,'Contract',(193,63,45)); mk('附件.pdf',4,'Appendix',(40,60,56)); mk('身份证明.pdf',2,'ID',(90,110,160))
for i in range(4): Image.new('RGB',(900,600),(200-i*30,170,120+i*20)).save('${dir}/照片%d.jpg'%(i+1))
"`);
  const pdfs = ['合同.pdf', '附件.pdf', '身份证明.pdf'].map(f => path.join(dir, f)), imgs = [1, 2, 3, 4].map(i => path.join(dir, `照片${i}.jpg`));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const mobile of [false, true]) {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 } : { width: 1280, height: 900 });
    await p.goto(URL_, { waitUntil: 'networkidle0' });
    const S = n => p.screenshot({ path: `screenshots/${n}.png` });
    const tab = async t => { await p.click(`#tabs button[data-tool=${t}]`); await sleep(300); };
    if (!mobile) await S('01-desktop-home'); else await S('m1-home');
    await (await p.$('#drop-merge input')).uploadFile(...pdfs); await sleep(1500); await S(mobile ? 'm2-merge' : '02-desktop-merge');
    await tab('split'); await (await p.$('#drop-split input')).uploadFile(pdfs[1]); await sleep(1500); await p.click('#p-split .chips button[data-q=odd]'); await sleep(300); await S(mobile ? 'm5-split' : '04-desktop-split');
    await tab('organize'); await (await p.$('#drop-organize input')).uploadFile(pdfs[0]); await sleep(1500); await S(mobile ? 'm3-organize' : '05-desktop-organize');
    await tab('pagenum'); await (await p.$('#drop-pagenum input')).uploadFile(pdfs[1]); await sleep(1500); await S(mobile ? 'm4-pagenum' : '06-desktop-pagenum');
    if (!mobile) { await tab('img'); await (await p.$('#drop-img input')).uploadFile(...imgs); await sleep(1200); await S('07-desktop-img'); }
  }
  await b.close(); fs.rmSync(dir, { recursive: true });
})();

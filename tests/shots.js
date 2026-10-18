// 生成 screenshots/：python3 -m http.server 8768 & ; NODE_PATH=... node tests/shots.js（示例文件为程序生成的虚构内容）
const puppeteer = require('puppeteer-core'), { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const URL_ = process.env.URL || 'http://localhost:8768/index.html';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbs-'));
  execSync(`python3 -c "
from PIL import Image, ImageDraw
def mk(name, n, title, col):
    pages=[]
    for i in range(n):
        im=Image.new('RGB',(794,1123),'white'); d=ImageDraw.Draw(im)
        d.rectangle((60,60,734,120),fill=col); d.text((80,80),'%s  P%d'%(title,i+1),fill='white')
        for k in range(14): d.rectangle((80,180+k*50,714-(k%3)*90,196+k*50),fill=(215,215,210))
        pages.append(im)
    pages[0].save('${dir}/'+name,save_all=True,append_images=pages[1:])
mk('contract.pdf',3,'Contract',(0,48,74)); mk('appendix.pdf',4,'Appendix',(57,113,139)); mk('id.pdf',2,'ID',(16,42,54))
for i in range(4): Image.new('RGB',(900,600),(200-i*30,170,120+i*20)).save('${dir}/p%d.jpg'%(i+1))
"`);
  const pdfs = ['contract.pdf', 'appendix.pdf', 'id.pdf'].map(f => path.join(dir, f)), imgs = [1, 2, 3, 4].map(i => path.join(dir, `p${i}.jpg`));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const mobile of [false, true]) {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 } : { width: 1366, height: 900 });
    await p.goto(URL_, { waitUntil: 'networkidle0' });
    const pre = mobile ? 'm-' : 'd-';
    const S = (n, full) => p.screenshot({ path: `screenshots/${pre}${n}.png`, fullPage: !!full });
    const tab = async t => { await p.click(`#tabs button[data-tool=${t}]`); await sleep(400); await p.evaluate(() => window.scrollTo(0, document.querySelector('.app').offsetTop - 70)); };
    await S('01-home');
    await (await p.$('#drop-merge input')).uploadFile(...pdfs); await sleep(1500); await S('02-merge');
    await tab('split'); await (await p.$('#drop-split input')).uploadFile(pdfs[1]); await sleep(1500); await p.click('#p-split .chips button[data-q=odd]'); await sleep(300); await S('03-split');
    await tab('organize'); await (await p.$('#drop-organize input')).uploadFile(pdfs[0]); await sleep(1500); await S('04-organize');
    await tab('wm'); await (await p.$('#drop-wm input')).uploadFile(pdfs[0]); await sleep(1500);
    await p.$eval('#wm-text', e => { e.value = '机密 CONFIDENTIAL'; e.dispatchEvent(new Event('input', { bubbles: true })) }); await sleep(300); await S('05-watermark', true);
    await tab('sign'); await (await p.$('#drop-sign input')).uploadFile(pdfs[0]); await sleep(1500);
    const pad = await p.$('#sg-pad'); await pad.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(200); const pb = await pad.boundingBox();
    await p.mouse.move(pb.x + pb.width * .1, pb.y + pb.height * .6); await p.mouse.down();
    for (let i = 0; i <= 40; i++) await p.mouse.move(pb.x + pb.width * (.1 + i * .02), pb.y + pb.height * (.55 + .22 * Math.sin(i / 3.5) * (1 - i / 60)), { steps: 2 });
    await p.mouse.up(); await p.click('#sg-add'); await sleep(300); await p.evaluate(() => window.scrollTo(0, document.querySelector('.app').offsetTop - 70)); await sleep(200); await S('06-sign', true);
    await tab('toimg'); await (await p.$('#drop-toimg input')).uploadFile(pdfs[1]); await sleep(1200); await S('07-toimg');
    await tab('compress'); await S('08-compress');
    await tab('img'); await (await p.$('#drop-img input')).uploadFile(...imgs); await sleep(1200); await S('09-img');
    await tab('pagenum'); await (await p.$('#drop-pagenum input')).uploadFile(pdfs[0]); await sleep(1500); await S('10-pagenum');
    if (!mobile) await p.screenshot({ path: 'screenshots/d-00-home-full.png', fullPage: true });
  }
  await b.close(); fs.rmSync(dir, { recursive: true });
})();

import { chromium } from 'playwright';
const BASE=process.env.TARGET ?? 'http://localhost:3000';
const SLUG=process.env.SLUG ?? 'taekwondo-gms-championship-2026';
const EMAIL=process.env.EMAIL ?? 'coach@demotkd.edu.in';
const PASS=process.env.PASS ?? 'School@123';
const bad:string[]=[]; const ck=(l:string,ok:boolean,d='')=>{console.log(`  ${ok?'PASS':'FAIL'}  ${l}${d?` — ${d}`:''}`);if(!ok)bad.push(l);};
// a 400x400 JPEG-ish payload: build a real PNG big enough that resizing kicks in
function bigPng(){
  const size=400; const header=Buffer.from('89504e470d0a1a0a','hex');
  return { size, buf: null as any };
}
(async()=>{
  const b=await chromium.launch({channel:'chrome',headless:true});
  const p=await (await b.newContext({viewport:{width:1440,height:1100}})).newPage();
  p.on('pageerror',e=>console.log('  PAGEERROR:',String(e).slice(0,160)));

  // make a real, largish photo in the browser so the resize path runs
  await p.goto(`${BASE}/events/${SLUG}/login`,{waitUntil:'load'});
  const dataUrl:string = await p.evaluate(async()=>{
    const c=document.createElement('canvas'); c.width=1600; c.height=1600;
    const x=c.getContext('2d')!;
    const g=x.createLinearGradient(0,0,1600,1600); g.addColorStop(0,'#c8102e'); g.addColorStop(1,'#0f1419');
    x.fillStyle=g; x.fillRect(0,0,1600,1600);
    for(let i=0;i<400;i++){x.fillStyle=`hsl(${i%360},70%,50%)`;x.fillRect(Math.random()*1600,Math.random()*1600,24,24);}
    return c.toDataURL('image/png');
  });
  const buf=Buffer.from(dataUrl.split(',')[1]!,'base64');
  console.log(`  source photo: ${Math.round(buf.length/1024)} KB`);

  await p.fill('input[name="email"]',EMAIL);
  await p.fill('input[name="password"]',PASS);
  await p.click('button[type="submit"]'); await p.waitForTimeout(3000);

  await p.goto(`${BASE}/events/${SLUG}/school/participants/new`,{waitUntil:'load'});
  await p.waitForSelector('input[name="name"]');
  const name=`Photo Probe ${Date.now().toString().slice(-5)}`;
  await p.fill('input[name="name"]',name);
  await p.fill('input[name="dob"]','2013-04-04');
  await p.fill('input[name="weightKg"]','40');
  await p.locator('input[type="file"]').first().setInputFiles({name:'big.png',mimeType:'image/png',buffer:buf});
  await p.waitForTimeout(1200);
  const resized=await p.locator('text=/Resized to \\d+ KB/').count();
  ck('browser downscales before upload', resized>0, resized? (await p.locator('text=/Resized to \\d+ KB/').first().innerText()):'no resize notice');

  await p.click('button:has-text("Add participant")');
  await p.waitForTimeout(6000);
  ck('participant saved', !p.url().includes('/new'));
  ck('no "photo could not be saved" warning', !/could not be saved|not configured/i.test(decodeURIComponent(p.url())),
     decodeURIComponent(p.url()).split('warn=')[1]?.slice(0,70) ?? '');

  // find them and confirm the photo renders
  await p.goto(`${BASE}/events/${SLUG}/school/participants`,{waitUntil:'load'});
  const row=p.locator(`tr:has-text("${name}") a`).first();
  await p.goto(BASE+(await row.getAttribute('href'))!,{waitUntil:'load'});
  await p.waitForTimeout(1500);
  const img=p.locator('img[src^="/api/photos/"]');
  ck('photo renders through the authenticated route', await img.count()>0);
  if(await img.count()){
    const ok=await img.first().evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0);
    const dims=await img.first().evaluate((el:HTMLImageElement)=>`${el.naturalWidth}x${el.naturalHeight}`);
    ck('the stored photo loads', ok, dims);
  }
  await b.close();
  console.log(bad.length?`\n${bad.length} PROBLEM(S): ${bad.join(' | ')}`:'\nAll photo checks passed');
})();

import { Router } from 'express';
import { installBrowserRuntimes } from '../browser/runtime-manager.js';

export function createScreenshotRouter():Router{
  const router=Router();
  router.post('/viewport-screenshot',async(req,res)=>{
    let browser:Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>>|undefined;
    try{
      const url=parseScreenshotUrl(req.body?.url);
      const width=clampDimension(req.body?.width,1100,320,3840),height=clampDimension(req.body?.height,700,240,2160);
      const scrollX=Math.max(0,Math.round(Number(req.body?.scrollX)||0)),scrollY=Math.max(0,Math.round(Number(req.body?.scrollY)||0));
      await installBrowserRuntimes(['chromium']);
      const playwright=await import('playwright');
      browser=await playwright.chromium.launch({headless:true,executablePath:playwright.chromium.executablePath(),args:['--disable-dev-shm-usage']});
      const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();
      await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});
      try{await page.waitForLoadState('load',{timeout:5000});}catch{}
      if(scrollX||scrollY)await page.evaluate(({x,y})=>scrollTo(x,y),{x:scrollX,y:scrollY});
      await page.waitForTimeout(80);
      const png=await page.screenshot({type:'png',fullPage:false,animations:'allow',caret:'hide',scale:'css'});
      res.setHeader('cache-control','no-store');
      return res.type('png').send(png);
    }catch(error){return res.status(400).send(error instanceof Error?error.message:String(error));}
    finally{try{await browser?.close();}catch{}}
  });
  return router;
}

function parseScreenshotUrl(value:unknown):URL{const url=new URL(String(value||''));if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https screenshot URLs are supported');return url;}
function clampDimension(value:unknown,fallback:number,min:number,max:number):number{const number=Math.round(Number(value)||fallback);return Math.max(min,Math.min(max,number));}

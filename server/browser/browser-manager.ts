import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright';
import type { BrowserEngine, BrowserProfile } from './types.js';
import { browserType, ensureBrowserRuntime, getPlaywright, mobileUserAgent, shouldRunHeadless } from './runtime-manager.js';

export type OpenedBrowser={browser:Browser;context:BrowserContext;page:Page;headless:boolean;width:number;height:number};

export async function launchBrowser(engine:BrowserEngine,profile:BrowserProfile,width?:number,height?:number):Promise<OpenedBrowser>{
  const size=profile==='mobile'?{width:390,height:844}:{width:clamp(Number(width)||1100,320,3840),height:clamp(Number(height)||700,240,2160)};
  await ensureBrowserRuntime(engine);
  const playwright=await getPlaywright(),type=browserType(playwright,engine),headless=shouldRunHeadless();
  const browser=await type.launch({headless,executablePath:type.executablePath(),...(engine==='chromium'?{args:['--disable-dev-shm-usage']}:{})});
  const contextOptions:BrowserContextOptions={viewport:size,ignoreHTTPSErrors:true};
  if(profile==='mobile'){contextOptions.deviceScaleFactor=3;contextOptions.hasTouch=true;contextOptions.userAgent=mobileUserAgent(engine);if(engine!=='firefox')contextOptions.isMobile=true;}
  const context=await browser.newContext(contextOptions),page=await context.newPage();
  return{browser,context,page,headless,width:size.width,height:size.height};
}

export async function closeBrowserResources(browser:Browser,context:BrowserContext):Promise<void>{try{await context.close();}catch{}try{await browser.close();}catch{}}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,Math.round(value||min)));}

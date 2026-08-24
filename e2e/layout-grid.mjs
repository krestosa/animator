import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';

const port=4199,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1536,height:900},deviceScaleFactor:1});
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.app').waitFor({state:'visible'});
    const more=page.locator('.toolbarMore');if(await more.count())await more.locator('summary').click();
    await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));
    await page.locator('[data-action="open-project"]').click();
    await page.locator('[data-preview-frame]').waitFor({state:'attached',timeout:15000});
    if(await more.count())await more.evaluate(element=>{if(element instanceof HTMLDetailsElement)element.open=false;});
    await page.waitForTimeout(500);

    const metrics=await page.evaluate(()=>{
      const box=(selector)=>{const node=document.querySelector(selector);if(!(node instanceof HTMLElement))return null;const rect=node.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom};};
      const app=document.querySelector('.app'),timeline=document.querySelector('[data-timeline-v2]'),firstLabel=document.querySelector('[data-timeline-v2] .v2Label');
      const timelineWidth=timeline instanceof HTMLElement?Number.parseFloat(getComputedStyle(timeline).getPropertyValue('--timeline-label-width')):NaN;
      return{
        viewport:{width:window.innerWidth,height:window.innerHeight,scrollWidth:document.documentElement.scrollWidth},
        tabs:box('.workspaceTabs'),command:box('.toolbar.studioCommandBar'),leftRail:box('.leftPanelTabRail'),toolRail:box('.studioToolRail'),previewChrome:box('.previewChrome'),viewerFooter:box('.studioViewerFooter'),inspectorTabs:box('.rightPanel nav'),timelineHeader:box('.timelineTop.studioTimelineHeader'),timelineIdentity:box('.studioTimelineIdentity'),firstLabel:box('[data-timeline-v2] .v2Label'),
        timelineWidth,
        appOverflow:app instanceof HTMLElement?{clientWidth:app.clientWidth,scrollWidth:app.scrollWidth}:null
      };
    });

    for(const key of ['tabs','command','leftRail','toolRail','previewChrome','viewerFooter','inspectorTabs','timelineHeader','timelineIdentity','firstLabel'])assert(metrics[key],`${key} was not rendered`);
    approx(metrics.tabs.height,32,0.6,'document tabs height');
    approx(metrics.command.height,36,0.6,'command bar height');
    approx(metrics.leftRail.width,32,0.6,'navigator rail width');
    approx(metrics.toolRail.width,32,0.6,'editing rail width');
    approx(metrics.previewChrome.height,32,0.6,'preview chrome height');
    approx(metrics.viewerFooter.height,36,0.6,'viewer footer height');
    approx(metrics.inspectorTabs.height,32,0.6,'inspector tabs height');
    approx(metrics.timelineHeader.height,48,0.6,'timeline header height');
    assert(Number.isFinite(metrics.timelineWidth),'Timeline label width token was not resolved');
    approx(metrics.timelineIdentity.width,metrics.timelineWidth,1.1,'timeline header/label grid alignment');
    approx(metrics.firstLabel.width,metrics.timelineWidth,1.1,'timeline lane label width');
    assert(metrics.timelineWidth>=184&&metrics.timelineWidth<=264,`Timeline label column escaped dense bounds: ${metrics.timelineWidth}`);
    assert(metrics.viewport.scrollWidth<=metrics.viewport.width,`Document has horizontal overflow: ${metrics.viewport.scrollWidth} > ${metrics.viewport.width}`);
    assert(metrics.appOverflow&&metrics.appOverflow.scrollWidth<=metrics.appOverflow.clientWidth,`App has horizontal overflow: ${JSON.stringify(metrics.appOverflow)}`);
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');}

function approx(actual,expected,tolerance,label){assert(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}±${tolerance}, got ${actual}`);}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}

import { mountApp as mountCoreApp } from './app-core';
import { mountMotionIrTimeline } from './motion-ir-timeline';

export function mountApp(root:HTMLElement):()=>void{
  const unmountCore=mountCoreApp(root);
  const unmountTimeline=mountMotionIrTimeline(root);
  return()=>{unmountTimeline();unmountCore();};
}

import { mountApp as mountCoreApp } from './app-core';
import { mountMotionIrInspector } from './motion-ir-inspector';
import { mountMotionIrTimeline } from './motion-ir-timeline';

export function mountApp(root:HTMLElement):()=>void{
  const unmountCore=mountCoreApp(root);
  const unmountInspector=mountMotionIrInspector(root);
  const unmountTimeline=mountMotionIrTimeline(root);
  return()=>{unmountTimeline();unmountInspector();unmountCore();};
}

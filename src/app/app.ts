import {mountApp as mountCoreApp} from './app-core';
import {mountMotionIrInspector} from './motion-ir-inspector';
import {mountMotionIrList} from './motion-ir-list';
import {mountMotionIrPanel} from './motion-ir-panel';
import {mountMotionIrTimeline} from './motion-ir-timeline';

export function mountApp(root:HTMLElement):()=>void{
  const unmountCore=mountCoreApp(root);
  const unmountList=mountMotionIrList(root);
  const unmountInspector=mountMotionIrInspector(root);
  const unmountPanel=mountMotionIrPanel(root);
  const unmountTimeline=mountMotionIrTimeline(root);
  return()=>{unmountTimeline();unmountPanel();unmountInspector();unmountList();unmountCore();};
}

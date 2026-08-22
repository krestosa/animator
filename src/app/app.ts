import {mountApp as mountCoreApp} from './app-core';
import {mountMotionIrInspector} from './motion-ir-inspector';
import {mountMotionIrList} from './motion-ir-list';
import {mountMotionIrPanel} from './motion-ir-panel';

export function mountApp(root:HTMLElement):()=>void{
  const unmountCore=mountCoreApp(root);
  const unmountList=mountMotionIrList(root);
  const unmountInspector=mountMotionIrInspector(root);
  const unmountPanel=mountMotionIrPanel(root);
  return()=>{unmountPanel();unmountInspector();unmountList();unmountCore();};
}

import {mountApp as mountCoreApp} from './app-core';
import {mountExportActionState} from './export-action-state';
import {mountMotionIrInspector} from './motion-ir-inspector';
import {mountMotionIrList} from './motion-ir-list';
import {mountMotionIrPanel} from './motion-ir-panel';

export function mountApp(root:HTMLElement):()=>void{
  const unmountCore=mountCoreApp(root);
  const unmountList=mountMotionIrList(root);
  const unmountInspector=mountMotionIrInspector(root);
  const unmountPanel=mountMotionIrPanel(root);
  const unmountExportState=mountExportActionState(root);
  return()=>{unmountExportState();unmountPanel();unmountInspector();unmountList();unmountCore();};
}

import { getBrowserSession } from './browser-session.js';

export type BrowserMotionElement={id:string;tag:string;domId?:string|undefined;classes:string[];text?:string|undefined;rect:{x:number;y:number;width:number;height:number};alive:boolean};
export type BrowserMotionAnimation={id:string;elementId:string;type:'css-animation'|'css-transition'|'web-animation'|'unknown';name?:string|undefined;startTime:number;duration?:number|undefined;delay?:number|undefined;iterations?:number|undefined;direction?:string|undefined;easing?:string|undefined;fill?:string|undefined;properties:Array<{name:string;values:string[]}>;confidence:'runtime-observed';runtimeState:'idle'|'running'|'paused'|'finished';keyframes:Array<Record<string,string|number|null>>};
export type BrowserMotionSnapshot={elements:BrowserMotionElement[];animations:BrowserMotionAnimation[];active:number;runtimeReady:boolean};

export async function scanBrowserMotion(id:string):Promise<BrowserMotionSnapshot>{
  const session=getBrowserSession(id);if(!session||session.closed)throw new Error('Browser preview session not found');
  return session.page.evaluate(()=>{
    const win=globalThis as typeof globalThis&{
      __ANIMATOR_ELEMENT_ID__?:((element:Element)=>string)|undefined;
      __ANIMATOR_RUNTIME__?:boolean|undefined;
      __ANIMATOR_BROWSER_SCAN_SEQ__?:number|undefined;
    };
    const elementIds=new Map<Element,string>();let fallbackSeq=Number(win.__ANIMATOR_BROWSER_SCAN_SEQ__)||0;
    const idFor=(element:Element):string=>{
      if(typeof win.__ANIMATOR_ELEMENT_ID__==='function'){try{return win.__ANIMATOR_ELEMENT_ID__(element);}catch{}}
      const object=element as Element&{__animatorBrowserElementId?:string|undefined};if(object.__animatorBrowserElementId)return object.__animatorBrowserElementId;
      const id=`browser-el-${++fallbackSeq}`;object.__animatorBrowserElementId=id;win.__ANIMATOR_BROWSER_SCAN_SEQ__=fallbackSeq;return id;
    };
    const elementMeta=(element:Element):BrowserMotionElement=>{const rect=element.getBoundingClientRect();return{id:idFor(element),tag:element.tagName.toLowerCase(),domId:element.id||undefined,classes:[...element.classList],text:(element.textContent||'').trim().slice(0,80)||undefined,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},alive:element.isConnected};};
    const rawAnimations=document.getAnimations().slice(0,600),animations:BrowserMotionAnimation[]=[];
    for(const animation of rawAnimations){
      const effect=animation.effect instanceof KeyframeEffect?animation.effect:null;if(!effect)continue;const target=effect.target;if(!(target instanceof Element)||target.hasAttribute('data-animator-internal'))continue;
      const object=animation as Animation&{__animatorId?:string|undefined;__animatorBrowserStartTime?:number|undefined};
      const id=object.__animatorId||(object.__animatorId=`browser-anim-${Math.random().toString(36).slice(2)}`),elementId=idFor(target);elementIds.set(target,elementId);
      let timing:ComputedEffectTiming={} as ComputedEffectTiming,rawFrames:ComputedKeyframe[]=[];try{timing=effect.getComputedTiming();rawFrames=effect.getKeyframes();}catch{}
      const keyframes=rawFrames.map(frame=>{const out:Record<string,string|number|null>={};for(const [key,value] of Object.entries(frame)){if(value===undefined)continue;if(value===null||typeof value==='number'||typeof value==='string')out[key]=value;else out[key]=String(value);}return out;});
      const names=[...new Set(keyframes.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))],properties=names.map(name=>({name,values:keyframes.map(frame=>frame[name]).filter(value=>value!=null).map(String)}));
      const cssAnimation=typeof CSSAnimation!=='undefined'&&animation instanceof CSSAnimation,cssTransition=typeof CSSTransition!=='undefined'&&animation instanceof CSSTransition,type=cssAnimation?'css-animation':cssTransition?'css-transition':'web-animation';const name=cssAnimation?(animation as CSSAnimation).animationName:cssTransition?(animation as CSSTransition).transitionProperty:undefined;
      const current=Number(animation.currentTime),rate=Math.abs(Number(animation.playbackRate))||1;if(!Number.isFinite(object.__animatorBrowserStartTime))object.__animatorBrowserStartTime=Math.max(0,performance.now()-(Number.isFinite(current)?Math.max(0,current)/rate:0));
      const runtimeState=animation.playState==='finished'?'finished':animation.playState==='paused'?'paused':animation.playState==='idle'?'idle':'running';
      animations.push({id,elementId,type,name,startTime:Number(object.__animatorBrowserStartTime)||0,duration:Number(timing.duration)||undefined,delay:Number(timing.delay)||undefined,iterations:Number(timing.iterations)||undefined,direction:String(timing.direction||'normal'),easing:String(timing.easing||'linear'),fill:String(timing.fill||'none'),properties,confidence:'runtime-observed',runtimeState,keyframes});
    }
    return{elements:[...elementIds.keys()].map(elementMeta),animations,active:rawAnimations.length,runtimeReady:!!win.__ANIMATOR_RUNTIME__};
  });
}

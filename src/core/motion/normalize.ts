import type { AnimationType, DetectedAnimation } from '../../types/domain';
import type { MotionKeyframe, MotionSourceKind, MotionTrack } from './motion-model';

const sourceKind=(type:AnimationType):MotionSourceKind=>{
  switch(type){
    case 'css-animation': return 'css-animation';
    case 'css-transition': return 'css-transition';
    case 'web-animation': return 'waapi';
    case 'javascript': return 'javascript';
    case 'raf': return 'raf';
    case 'runtime-style': return 'runtime-style';
    default: return 'unknown';
  }
};

const normalizeKeyframes=(frames:DetectedAnimation['keyframes']):MotionKeyframe[]=>{
  if(!frames?.length)return [];
  return frames.map(frame=>{
    const values:Record<string,string|number|null>={};
    let offset:number|undefined,easing:string|undefined,composite:string|undefined;
    for(const [key,value] of Object.entries(frame)){
      if(key==='offset'&&typeof value==='number'){offset=value;continue;}
      if(key==='easing'&&typeof value==='string'){easing=value;continue;}
      if(key==='composite'&&typeof value==='string'){composite=value;continue;}
      values[key]=value;
    }
    return {values,...(offset!==undefined?{offset}:{}),...(easing?{easing}:{}),...(composite?{composite}:{})};
  });
};

export function detectedAnimationToMotionTrack(animation:DetectedAnimation):MotionTrack{
  return {
    id:animation.id,
    ...(animation.name?{name:animation.name}:{}),
    target:{elementId:animation.elementId,...(animation.source?.selector?{selector:animation.source.selector}:{})},
    timing:{
      start:animation.startTime,
      ...(animation.duration!==undefined?{duration:animation.duration}:{}),
      ...(animation.delay!==undefined?{delay:animation.delay}:{}),
      ...(animation.iterations!==undefined?{iterations:animation.iterations}:{}),
      ...(animation.direction?{direction:animation.direction}:{}),
      ...(animation.easing?{easing:animation.easing}:{}),
      ...(animation.fill?{fill:animation.fill}:{})
    },
    properties:animation.properties.map(property=>({...property})),
    keyframes:normalizeKeyframes(animation.keyframes),
    trigger:{kind:'unknown'},
    source:{kind:sourceKind(animation.type),...(animation.source?{reference:animation.source}:{}),confidence:animation.confidence},
    runtimeState:animation.runtimeState,
    metadata:{legacyType:animation.type}
  };
}

export function detectedAnimationsToMotionTracks(animations:DetectedAnimation[]):MotionTrack[]{return animations.map(detectedAnimationToMotionTrack);}

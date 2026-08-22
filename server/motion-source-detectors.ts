import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type ExtendedAnimationType='web-animation'|'javascript'|'raf'|'gsap'|'framer-motion'|'scroll-timeline'|'svg'|'canvas';
export interface DetectorSourceRef{file:string;line?:number;column?:number;selector?:string;snippet?:string;}
export interface SourceDetectedAnimation{id:string;elementId:string;type:ExtendedAnimationType;name?:string;startTime:number;duration?:number;delay?:number;iterations?:number;direction?:string;easing?:string;fill?:string;properties:Array<{name:string;values:string[]}>;source:DetectorSourceRef;confidence:'exact'|'inferred';runtimeState:'idle';keyframes?:Array<Record<string,string|number|null>>;}
export interface SourceCandidate{kind:string;file:string;line:number;column?:number;functionName?:string;snippet:string;}
export interface SourceDetectionResult{animations:SourceDetectedAnimation[];candidates:SourceCandidate[];}

const configKeys=new Set(['duration','delay','ease','easing','repeat','repeatDelay','yoyo','stagger','overwrite','onStart','onUpdate','onComplete','paused','immediateRender','scrollTrigger','defaults','timeline','fill','iterations','direction']);
const canvasMethods=/\.(?:clearRect|fillRect|strokeRect|drawImage|fillText|strokeText|arc|ellipse|lineTo|moveTo|bezierCurveTo|quadraticCurveTo|fill|stroke)\s*\(/;

export function detectSourceMotion(file:string,root:string):SourceDetectionResult{
  const source=fs.readFileSync(file,'utf8'),rel=path.relative(root,file).split(path.sep).join('/');
  if(/\.(?:svg|html?)$/i.test(file))return detectMarkup(source,rel);
  if(!/\.(?:m?[jt]s|[jt]sx)$/i.test(file))return{animations:[],candidates:[]};
  return detectScript(source,file,rel);
}

function detectScript(source:string,file:string,rel:string):SourceDetectionResult{
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,scriptKind(file)),animations:SourceDetectedAnimation[]=[],candidates:SourceCandidate[]=[];
  const pushCandidate=(node:ts.Node,kind:string):void=>{const location=sf.getLineAndCharacterOfPosition(node.getStart(sf)),functionName=enclosingFunctionName(node,sf);candidates.push({kind,file:rel,line:location.line+1,column:location.character+1,...(functionName?{functionName}:{}),snippet:node.getText(sf).slice(0,240)});};
  const push=(node:ts.Node,input:Omit<SourceDetectedAnimation,'id'|'startTime'|'source'|'runtimeState'>):void=>{const location=sf.getLineAndCharacterOfPosition(node.getStart(sf));animations.push({...input,id:`${input.type}:${rel}:${location.line+1}:${location.character+1}:${animations.length}`,startTime:0,source:{file:rel,line:location.line+1,column:location.character+1,snippet:node.getText(sf).slice(0,320)},runtimeState:'idle'});};
  const scan=(node:ts.Node):void=>{
    if(ts.isCallExpression(node)){
      const expression=node.expression.getText(sf);
      if(expression.endsWith('.animate')){
        const target=expression.slice(0,-'.animate'.length),frames=readKeyframes(node.arguments[0],sf),options=readObject(node.arguments[1],sf),timeline=options?.timeline;
        push(node,{elementId:`static-js:${target}`,type:typeof timeline==='string'&&/ScrollTimeline|ViewTimeline/i.test(timeline)?'scroll-timeline':'web-animation',name:`animate ${target}`,duration:toMs(options?.duration),delay:toMs(options?.delay),iterations:toNumber(options?.iterations),direction:toStringValue(options?.direction),easing:toStringValue(options?.easing),fill:toStringValue(options?.fill),properties:propertiesFromFrames(frames),confidence:frames.length?'exact':'inferred',...(frames.length?{keyframes:frames}:{})});
        pushCandidate(node,'waapi');
      }else if(isGsapCall(expression)){
        const args=[...node.arguments],method=expression.split('.').at(-1)??'to',targetArg=method==='fromTo'?args[0]:args[0],varsArg=method==='fromTo'?args[2]:args[1],fromArg=method==='fromTo'?args[1]:undefined,vars=readObject(varsArg,sf),from=readObject(fromArg,sf),target=targetArg?.getText(sf)??'target',properties=propertiesFromVars(vars,from),duration=secondsToMs(vars?.duration),delay=secondsToMs(vars?.delay),repeat=toNumber(vars?.repeat),iterations=repeat!==undefined?Math.max(1,repeat+1):undefined;
        push(node,{elementId:`static-js:${target}`,type:'gsap',name:`GSAP ${method}`,duration,delay,iterations,easing:toStringValue(vars?.ease),properties,confidence:'inferred',...(vars?{keyframes:gsapFrames(method,from,vars)}:{})});pushCandidate(node,'gsap');
      }else if(expression==='requestAnimationFrame'||expression.endsWith('.requestAnimationFrame')){
        const fn=enclosingFunctionNode(node),text=fn?.getText(sf)??node.parent?.getText(sf)??'',canvas=canvasMethods.test(text)||/getContext\s*\(\s*['"]2d['"]\s*\)/.test(text);push(node,{elementId:`static-js:${enclosingFunctionName(node,sf)??'raf'}`,type:canvas?'canvas':'raf',name:canvas?'Canvas animation':'requestAnimationFrame loop',properties:[],confidence:'inferred'});pushCandidate(node,canvas?'canvas-raf':'raf');
      }else if(/\.classList\.(?:add|remove|toggle|replace)$/.test(expression))pushCandidate(node,'class-mutation');
      else if(expression.endsWith('.setAttribute'))pushCandidate(node,'attribute-mutation');
      else if(expression.endsWith('.style.setProperty'))pushCandidate(node,'style-write');
    }
    if(ts.isNewExpression(node)&&/^(?:window\.)?(?:ScrollTimeline|ViewTimeline)$/.test(node.expression.getText(sf)))pushCandidate(node,'scroll-timeline');
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))detectFramerJsx(node,sf,rel,animations);
    ts.forEachChild(node,scan);
  };
  scan(sf);return{animations:dedupeAnimations(animations),candidates};
}

function detectFramerJsx(node:ts.JsxOpeningElement|ts.JsxSelfClosingElement,sf:ts.SourceFile,rel:string,animations:SourceDetectedAnimation[]):void{
  const tag=node.tagName.getText(sf);if(!/^motion\./.test(tag)&&tag!=='motion')return;
  const animateAttr=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(sf)==='animate') as ts.JsxAttribute|undefined;if(!animateAttr)return;
  const initialAttr=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(sf)==='initial') as ts.JsxAttribute|undefined,transitionAttr=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(sf)==='transition') as ts.JsxAttribute|undefined,animate=readJsxObject(animateAttr,sf),initial=initialAttr?readJsxObject(initialAttr,sf):undefined,transition=transitionAttr?readJsxObject(transitionAttr,sf):undefined,location=sf.getLineAndCharacterOfPosition(node.getStart(sf)),properties=propertiesFromVars(animate,initial),frames=animate?[objectToFrame(initial??{}),objectToFrame(animate)].filter(frame=>Object.keys(frame).length):undefined;
  animations.push({id:`framer:${rel}:${location.line+1}:${location.character+1}`,elementId:`static-jsx:${rel}:${location.line+1}`,type:'framer-motion',name:tag,startTime:0,duration:secondsToMs(transition?.duration),delay:secondsToMs(transition?.delay),easing:toStringValue(transition?.ease),properties,source:{file:rel,line:location.line+1,column:location.character+1,snippet:node.getText(sf).slice(0,320)},confidence:'inferred',runtimeState:'idle',...(frames?.length?{keyframes:frames}:{})});
}

function detectMarkup(source:string,rel:string):SourceDetectionResult{
  const animations:SourceDetectedAnimation[]=[],candidates:SourceCandidate[]=[];const pattern=/<(animate(?:Transform|Motion)?|set)\b([^>]*)>/gi;let match:RegExpExecArray|null;
  while((match=pattern.exec(source))){const tag=match[1]??'animate',attrs=parseAttributes(match[2]??''),line=lineAt(source,match.index),property=attrs.attributeName??(tag==='animateTransform'?'transform':tag==='animateMotion'?'motion':'unknown'),values=(attrs.values?.split(';').map(value=>value.trim()).filter(Boolean)??[attrs.from,attrs.to].filter((value):value is string=>!!value)),duration=parseClock(attrs.dur),delay=parseClock(attrs.begin),keyframes=values.length?values.map((value,index)=>({offset:values.length<=1?0:index/(values.length-1),[property]:value})):undefined;animations.push({id:`svg:${rel}:${line}:${animations.length}`,elementId:`static-svg:${rel}:${line}`,type:'svg',name:tag,startTime:0,duration,delay,properties:property==='unknown'?[]:[{name:property,values}],source:{file:rel,line,snippet:match[0].slice(0,320)},confidence:'exact',runtimeState:'idle',...(keyframes?{keyframes}:{})});candidates.push({kind:'svg-smil',file:rel,line,snippet:match[0].slice(0,240)});}
  return{animations,candidates};
}

function isGsapCall(expression:string):boolean{return/^(?:window\.)?gsap\.(?:to|from|fromTo|set)$/.test(expression)||/\.to$|\.from$|\.fromTo$/.test(expression)&&/gsap|timeline/i.test(expression);}
function readJsxObject(attribute:ts.JsxAttribute,sf:ts.SourceFile):Record<string,unknown>|undefined{const init=attribute.initializer;if(!init||!ts.isJsxExpression(init)||!init.expression)return undefined;return readObject(init.expression,sf);}
function readObject(node:ts.Node|undefined,sf:ts.SourceFile):Record<string,unknown>|undefined{if(!node||!ts.isObjectLiteralExpression(node))return undefined;const out:Record<string,unknown>={};for(const prop of node.properties){if(!ts.isPropertyAssignment(prop)&&!ts.isShorthandPropertyAssignment(prop))continue;const key=prop.name.getText(sf).replace(/^['"]|['"]$/g,'');if(ts.isShorthandPropertyAssignment(prop)){out[key]=prop.name.getText(sf);continue;}out[key]=literalValue(prop.initializer,sf);}return out;}
function literalValue(node:ts.Expression,sf:ts.SourceFile):unknown{if(ts.isStringLiteralLike(node))return node.text;if(ts.isNumericLiteral(node))return Number(node.text);if(node.kind===ts.SyntaxKind.TrueKeyword)return true;if(node.kind===ts.SyntaxKind.FalseKeyword)return false;if(ts.isArrayLiteralExpression(node))return node.elements.map(element=>literalValue(element as ts.Expression,sf));if(ts.isObjectLiteralExpression(node))return readObject(node,sf);return node.getText(sf);}
function readKeyframes(node:ts.Node|undefined,sf:ts.SourceFile):Array<Record<string,string|number|null>>{if(!node)return[];if(ts.isArrayLiteralExpression(node))return node.elements.flatMap(element=>{const object=readObject(element,sf);return object?[objectToFrame(object)]:[];});const object=readObject(node,sf);if(!object)return[];const arrayKeys=Object.entries(object).filter(([,value])=>Array.isArray(value));if(arrayKeys.length){const count=Math.max(...arrayKeys.map(([,value])=>(value as unknown[]).length));return Array.from({length:count},(_,index)=>{const frame:Record<string,string|number|null>={offset:count<=1?0:index/(count-1)};for(const[key,value]of Object.entries(object)){if(Array.isArray(value)){const item=value[index]??value.at(-1);if(isMotionValue(item))frame[key]=item;}else if(isMotionValue(value))frame[key]=value;}return frame;});}return[objectToFrame(object)];}
function objectToFrame(object:Record<string,unknown>):Record<string,string|number|null>{const frame:Record<string,string|number|null>={};for(const[key,value]of Object.entries(object))if(isMotionValue(value)&&!configKeys.has(key))frame[key]=value;return frame;}
function propertiesFromFrames(frames:Array<Record<string,string|number|null>>):Array<{name:string;values:string[]}>{const keys=[...new Set(frames.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))];return keys.map(name=>({name,values:frames.map(frame=>frame[name]).filter(value=>value!=null).map(String)}));}
function propertiesFromVars(to:Record<string,unknown>|undefined,from:Record<string,unknown>|undefined):Array<{name:string;values:string[]}>{const keys=[...new Set([...Object.keys(from??{}),...Object.keys(to??{})].filter(key=>!configKeys.has(key)))];return keys.map(name=>({name,values:[from?.[name],to?.[name]].filter(value=>value!==undefined).map(String)}));}
function gsapFrames(method:string,from:Record<string,unknown>|undefined,to:Record<string,unknown>):Array<Record<string,string|number|null>>{const clean=(value:Record<string,unknown>)=>objectToFrame(value);if(method==='fromTo')return[clean(from??{}),clean(to)];if(method==='from')return[clean(to),{}];return[{},clean(to)];}
function toNumber(value:unknown):number|undefined{const number=typeof value==='number'?value:Number(value);return Number.isFinite(number)?number:undefined;}
function toMs(value:unknown):number|undefined{return toNumber(value);}
function secondsToMs(value:unknown):number|undefined{const number=toNumber(value);return number===undefined?undefined:number*1000;}
function toStringValue(value:unknown):string|undefined{return typeof value==='string'?value:undefined;}
function isMotionValue(value:unknown):value is string|number|null{return value===null||typeof value==='string'||typeof value==='number';}
function scriptKind(file:string):ts.ScriptKind{if(/\.tsx$/i.test(file))return ts.ScriptKind.TSX;if(/\.jsx$/i.test(file))return ts.ScriptKind.JSX;if(/\.ts$/i.test(file))return ts.ScriptKind.TS;return ts.ScriptKind.JS;}
function enclosingFunctionNode(node:ts.Node):ts.Node|undefined{let current=node.parent;while(current){if(ts.isFunctionLike(current))return current;current=current.parent;}return undefined;}
function enclosingFunctionName(node:ts.Node,sf:ts.SourceFile):string|undefined{let current=node.parent;while(current){if(ts.isFunctionDeclaration(current)&&current.name)return current.name.text;if(ts.isMethodDeclaration(current)&&current.name)return current.name.getText(sf);if((ts.isArrowFunction(current)||ts.isFunctionExpression(current))&&current.parent){const parent=current.parent;if(ts.isVariableDeclaration(parent)&&ts.isIdentifier(parent.name))return parent.name.text;if(ts.isPropertyAssignment(parent))return parent.name.getText(sf);if(ts.isCallExpression(parent)&&/addEventListener$/.test(parent.expression.getText(sf))){const eventArg=parent.arguments[0];return eventArg&&ts.isStringLiteralLike(eventArg)?`event:${eventArg.text}`:'event-callback';}}current=current.parent;}return undefined;}
function parseAttributes(value:string):Record<string,string>{const out:Record<string,string>={};for(const match of value.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g))out[match[1]??'']=match[3]??'';return out;}
function parseClock(value:string|undefined):number|undefined{if(!value)return undefined;const match=value.match(/^([\d.]+)(ms|s)?$/i);if(!match)return undefined;return Number(match[1])*(match[2]?.toLowerCase()==='s'?1000:1);}
function lineAt(source:string,index:number):number{return source.slice(0,index).split('\n').length;}
function dedupeAnimations(items:SourceDetectedAnimation[]):SourceDetectedAnimation[]{const seen=new Set<string>();return items.filter(item=>{const key=`${item.type}:${item.source.file}:${item.source.line}:${item.name??''}`;if(seen.has(key))return false;seen.add(key);return true;});}

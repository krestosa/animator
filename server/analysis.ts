import fs from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule, type Declaration, type Root, type Rule } from 'postcss';
import ts from 'typescript';
import type { LoadedProject } from './project.js';

interface SourceRef { file:string; line?:number; column?:number; selector?:string; snippet?:string; media?:string; }
interface StaticAnimation { id:string; elementId:string; type:'css-animation'; name?:string; startTime:number; duration?:number; delay?:number; iterations?:number; direction?:string; easing?:string; fill?:string; properties:Array<{name:string;values:string[]}>; source:SourceRef; confidence:'exact'; runtimeState:'idle'; }
interface StaticTransition { selector:string; properties:string[]; source:SourceRef; }
interface StaticCandidate { kind:string; file:string; line:number; column?:number; functionName?:string; snippet:string; }
interface AncestorNode { type:string; name?:string; params?:string; parent?:unknown; }
export interface AnalysisResult { animations:StaticAnimation[]; transitions:StaticTransition[]; candidates:StaticCandidate[]; reducedMotion:boolean; }

type ParsedCss={file:string;rel:string;root:Root};
type KeyframeRef={file:string;node:AtRule};
type AnimationSpec={name?:string;duration?:number;delay?:number;easing?:string;iterations?:number;direction?:string;fill?:string};

const ignored=new Set(['node_modules','.git','dist','build','coverage','.cache','server-dist','.animator']);
const motionFields=new Set(['duration','delay','ease','easing','opacity','transform','translate','scale','rotate','x','y','width','height','clippath','filter','left','top','right','bottom','backgroundcolor','borderradius']);
const directions=new Set(['normal','reverse','alternate','alternate-reverse']);
const fills=new Set(['none','forwards','backwards','both']);
const timingKeywords=new Set(['linear','ease','ease-in','ease-out','ease-in-out','step-start','step-end']);
const animationReserved=new Set(['none','infinite','running','paused',...directions,...fills,...timingKeywords]);

export function analyzeProject(project:LoadedProject):AnalysisResult {
  const animations:StaticAnimation[]=[];
  const transitions:StaticTransition[]=[];
  const candidates:StaticCandidate[]=[];
  let reducedMotion=false;
  const files=collectFiles(project.root);
  const css=parseCssFiles(files,project.root);
  const keyframes=new Map<string,KeyframeRef>();

  for(const item of css){
    item.root.walkAtRules(at=>{
      if(/(?:^|-)keyframes$/i.test(at.name))keyframes.set(at.params.trim(),{file:item.rel,node:at});
      if(at.name.toLowerCase()==='media'&&/prefers-reduced-motion\s*:\s*reduce/i.test(at.params))reducedMotion=true;
    });
  }

  for(const item of css){
    item.root.walkRules((rule:Rule)=>{
      if(isInsideKeyframes(rule))return;
      const declarations=directDeclarations(rule);
      const animationDeclaration=findMotionDeclaration(declarations,'animation');
      if(animationDeclaration){
        const specs=parseAnimationSpecs(declarations,keyframes);
        const location=animationDeclaration.source?.start;
        const media=mediaContext(rule);
        specs.forEach((spec,index)=>{
          const frame=spec.name?keyframes.get(spec.name):undefined;
          animations.push({
            id:`css:${item.rel}:${location?.line??0}:${rule.selector}:${index}`,
            elementId:`static:${rule.selector}`,
            type:'css-animation',
            ...(spec.name?{name:spec.name}:{}),
            startTime:0,
            ...(spec.duration!==undefined?{duration:spec.duration}:{}),
            ...(spec.delay!==undefined?{delay:spec.delay}:{}),
            ...(spec.iterations!==undefined?{iterations:spec.iterations}:{}),
            ...(spec.direction?{direction:spec.direction}:{}),
            ...(spec.easing?{easing:spec.easing}:{}),
            ...(spec.fill?{fill:spec.fill}:{}),
            properties:frame?extractKeyframeProps(frame.node):[],
            source:{file:item.rel,...(location?.line?{line:location.line}:{}),...(location?.column?{column:location.column}:{}),selector:rule.selector,snippet:animationDeclaration.toString(),...(media?{media}:{})},
            confidence:'exact',runtimeState:'idle'
          });
        });
      }

      const transitionDeclaration=findMotionDeclaration(declarations,'transition');
      if(transitionDeclaration){
        const location=transitionDeclaration.source?.start;
        const media=mediaContext(rule);
        transitions.push({selector:rule.selector,properties:parseTransitionProperties(declarations),source:{file:item.rel,...(location?.line?{line:location.line}:{}),...(location?.column?{column:location.column}:{}),selector:rule.selector,snippet:transitionDeclaration.toString(),...(media?{media}:{})}});
      }
    });
  }

  for(const file of files.filter(file=>/\.(?:m?[jt]s|[jt]sx)$/i.test(file)))analyzeScript(file,project.root,candidates);
  return{animations,transitions,candidates,reducedMotion};
}

function collectFiles(root:string):string[]{const out:string[]=[];const visit=(dir:string):void=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())visit(full);else out.push(full);}};visit(root);return out;}
function parseCssFiles(files:string[],root:string):ParsedCss[]{const out:ParsedCss[]=[];for(const file of files.filter(candidate=>/\.(?:css|scss)$/i.test(candidate))){const source=fs.readFileSync(file,'utf8');try{out.push({file,rel:path.relative(root,file).split(path.sep).join('/'),root:postcss.parse(source,{from:file})});}catch{/* Unsupported syntax is intentionally skipped instead of fabricating results. */}}return out;}
function directDeclarations(rule:Rule):Map<string,Declaration>{const map=new Map<string,Declaration>();for(const node of rule.nodes??[])if(node.type==='decl')map.set(node.prop.toLowerCase(),node);return map;}
function findMotionDeclaration(declarations:Map<string,Declaration>,prefix:'animation'|'transition'):Declaration|undefined{return[...declarations].find(([property])=>property===prefix||property.startsWith(`${prefix}-`))?.[1];}

function parseAnimationSpecs(declarations:Map<string,Declaration>,keyframes:Map<string,KeyframeRef>):AnimationSpec[]{
  const shorthand=declarations.get('animation')?.value;
  if(shorthand)return splitCssList(shorthand).map(part=>parseAnimationShorthand(part,keyframes));
  const names=cssList(declarations.get('animation-name')?.value);
  const durations=cssList(declarations.get('animation-duration')?.value).map(toMs);
  const delays=cssList(declarations.get('animation-delay')?.value).map(toMs);
  const easings=cssList(declarations.get('animation-timing-function')?.value);
  const iterations=cssList(declarations.get('animation-iteration-count')?.value).map(parseIterations);
  const directionList=cssList(declarations.get('animation-direction')?.value);
  const fillList=cssList(declarations.get('animation-fill-mode')?.value);
  const count=Math.max(1,names.length,durations.length,delays.length,easings.length,iterations.length,directionList.length,fillList.length);
  return Array.from({length:count},(_,index)=>({
    ...(cycle(names,index)&&cycle(names,index)!=='none'?{name:cycle(names,index)}:{}),
    ...(cycle(durations,index)!==undefined?{duration:cycle(durations,index)}:{}),
    ...(cycle(delays,index)!==undefined?{delay:cycle(delays,index)}:{}),
    ...(cycle(easings,index)?{easing:cycle(easings,index)}:{}),
    ...(cycle(iterations,index)!==undefined?{iterations:cycle(iterations,index)}:{}),
    ...(cycle(directionList,index)?{direction:cycle(directionList,index)}:{}),
    ...(cycle(fillList,index)?{fill:cycle(fillList,index)}:{})
  }));
}

function parseAnimationShorthand(value:string,keyframes:Map<string,KeyframeRef>):AnimationSpec{
  const tokens=splitWhitespace(value);const spec:AnimationSpec={};let timeCount=0;const unclassified:string[]=[];
  for(const token of tokens){const time=toMs(token);if(time!==undefined){if(timeCount===0)spec.duration=time;else if(timeCount===1)spec.delay=time;timeCount++;continue;}if(isTiming(token)){spec.easing=token;continue;}if(token==='infinite')continue;const iterations=parseIterations(token);if(iterations!==undefined&&/^\d/.test(token)){spec.iterations=iterations;continue;}if(directions.has(token)){spec.direction=token;continue;}if(fills.has(token)){spec.fill=token;continue;}if(token==='running'||token==='paused')continue;if(keyframes.has(token)){spec.name=token;continue;}if(!animationReserved.has(token))unclassified.push(token);}
  if(!spec.name&&unclassified.length)spec.name=unclassified.at(-1);
  return spec;
}

function parseTransitionProperties(declarations:Map<string,Declaration>):string[]{const explicit=declarations.get('transition-property')?.value;if(explicit)return cssList(explicit).filter(Boolean);const shorthand=declarations.get('transition')?.value;if(!shorthand)return['all'];return splitCssList(shorthand).map(part=>{for(const token of splitWhitespace(part))if(toMs(token)===undefined&&!isTiming(token)&&!['allow-discrete','normal'].includes(token))return token;return'all';});}
function splitCssList(value:string|undefined):string[]{if(!value)return[];return splitTopLevel(value,',').map(item=>item.trim()).filter(Boolean);}
function cssList(value:string|undefined):string[]{return splitCssList(value);}
function splitWhitespace(value:string):string[]{const out:string[]=[];let current='',depth=0,quote='';const flush=()=>{if(current.trim())out.push(current.trim());current='';};for(const char of value){if(quote){current+=char;if(char===quote)quote='';continue;}if(char==='"'||char==="'"){quote=char;current+=char;continue;}if(char==='('||char==='['){depth++;current+=char;continue;}if(char===')'||char===']'){depth=Math.max(0,depth-1);current+=char;continue;}if(/\s/.test(char)&&depth===0){flush();continue;}current+=char;}flush();return out;}
function splitTopLevel(value:string,separator:string):string[]{const out:string[]=[];let current='',depth=0,quote='';for(const char of value){if(quote){current+=char;if(char===quote)quote='';continue;}if(char==='"'||char==="'"){quote=char;current+=char;continue;}if(char==='('||char==='['){depth++;current+=char;continue;}if(char===')'||char===']'){depth=Math.max(0,depth-1);current+=char;continue;}if(char===separator&&depth===0){out.push(current);current='';continue;}current+=char;}out.push(current);return out;}
function cycle<T>(values:T[],index:number):T|undefined{return values.length?values[index%values.length]:undefined;}
function toMs(value:string|undefined):number|undefined{if(!value)return undefined;const match=value.trim().match(/^(-?[\d.]+)(ms|s)$/i);if(!match)return undefined;return Number(match[1])*(match[2]?.toLowerCase()==='s'?1000:1);}
function parseIterations(value:string|undefined):number|undefined{if(!value||value==='infinite')return undefined;const n=Number(value);return Number.isFinite(n)?n:undefined;}
function isTiming(value:string):boolean{return timingKeywords.has(value)||/^(?:cubic-bezier|steps|linear)\(/i.test(value);}
function extractKeyframeProps(at:AtRule):Array<{name:string;values:string[]}>{const out=new Map<string,string[]>();at.walkDecls(declaration=>{const values=out.get(declaration.prop)??[];values.push(declaration.value);out.set(declaration.prop,values);});return[...out].map(([name,values])=>({name,values}));}
function ancestors(rule:Rule):AncestorNode[]{const out:AncestorNode[]=[];let current=rule.parent as unknown as AncestorNode|undefined;while(current){out.push(current);current=current.parent as AncestorNode|undefined;}return out;}
function isInsideKeyframes(rule:Rule):boolean{return ancestors(rule).some(parent=>parent.type==='atrule'&&typeof parent.name==='string'&&/(?:^|-)keyframes$/i.test(parent.name));}
function mediaContext(rule:Rule):string|undefined{const media=ancestors(rule).filter(parent=>parent.type==='atrule'&&parent.name?.toLowerCase()==='media'&&typeof parent.params==='string').map(parent=>parent.params as string).reverse();return media.length?media.join(' and '):undefined;}

function analyzeScript(file:string,root:string,candidates:StaticCandidate[]):void{
  const source=fs.readFileSync(file,'utf8');const rel=path.relative(root,file).split(path.sep).join('/');const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,scriptKind(file));
  const scan=(node:ts.Node):void=>{
    let motionKind:string|undefined;
    if(ts.isCallExpression(node)){
      const expression=node.expression.getText(sf);
      if(expression.endsWith('.animate'))motionKind='waapi';
      else if(expression==='requestAnimationFrame'||expression.endsWith('.requestAnimationFrame'))motionKind='raf';
      else if(/\.classList\.(?:add|remove|toggle|replace)$/.test(expression))motionKind='class-mutation';
      else if(expression.endsWith('.setAttribute'))motionKind='attribute-mutation';
      else if(expression.endsWith('.style.setProperty')){const first=node.arguments[0];if(first&&ts.isStringLiteralLike(first)&&isMotionProperty(first.text))motionKind='style-write';}
      else{const argumentText=node.arguments.map(argument=>argument.getText(sf)).join(' ').toLowerCase();if([...motionFields].some(field=>argumentText.includes(field)))motionKind='animation-library-candidate';}
    }else if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){const left=node.left.getText(sf);if(/\.style\.(?:transform|opacity|left|top|right|bottom|width|height|filter|backgroundColor|borderRadius)$/.test(left))motionKind='style-write';}
    if(motionKind){const location=sf.getLineAndCharacterOfPosition(node.getStart(sf));const functionName=enclosingFunctionName(node,sf);candidates.push({kind:motionKind,file:rel,line:location.line+1,column:location.character+1,...(functionName?{functionName}:{}),snippet:node.getText(sf).slice(0,240)});}
    ts.forEachChild(node,scan);
  };
  scan(sf);
}
function scriptKind(file:string):ts.ScriptKind{if(/\.tsx$/i.test(file))return ts.ScriptKind.TSX;if(/\.jsx$/i.test(file))return ts.ScriptKind.JSX;if(/\.ts$/i.test(file))return ts.ScriptKind.TS;return ts.ScriptKind.JS;}
function isMotionProperty(value:string):boolean{const normalized=value.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase()).toLowerCase();return motionFields.has(normalized)||['transform','opacity','left','top','right','bottom','width','height','filter','background-color','border-radius'].includes(value.toLowerCase());}
function enclosingFunctionName(node:ts.Node,sf:ts.SourceFile):string|undefined{let current=node.parent;while(current){if(ts.isFunctionDeclaration(current)&&current.name)return current.name.text;if(ts.isMethodDeclaration(current)&&current.name)return current.name.getText(sf);if((ts.isArrowFunction(current)||ts.isFunctionExpression(current))&&current.parent){const parent=current.parent;if(ts.isVariableDeclaration(parent)&&ts.isIdentifier(parent.name))return parent.name.text;if(ts.isPropertyAssignment(parent))return parent.name.getText(sf);if(ts.isCallExpression(parent)&&/addEventListener$/.test(parent.expression.getText(sf))){const eventArg=parent.arguments[0];return eventArg&&ts.isStringLiteralLike(eventArg)?`event:${eventArg.text}`:'event-callback';}}current=current.parent;}return undefined;}

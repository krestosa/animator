import fs from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import ts from 'typescript';
import type { LoadedProject } from './project.js';

export interface AnalysisResult { animations:unknown[]; transitions:Array<{selector:string;properties:string[];source:{file:string;line?:number;column?:number;selector?:string;snippet?:string}}>; candidates:Array<{kind:string;file:string;line:number;snippet:string}>; reducedMotion:boolean; }
const motionFields=new Set(['duration','delay','ease','easing','opacity','transform','translate','scale','rotate','x','y','width','height','clipPath','filter','left','top']);
export function analyzeProject(project:LoadedProject):AnalysisResult {
  const animations:unknown[]=[]; const transitions:AnalysisResult['transitions']=[]; const candidates:AnalysisResult['candidates']=[]; let reducedMotion=false;
  const files:string[]=[]; const visit=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist','build','coverage','.cache'].includes(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory())visit(full);else files.push(full);}}; visit(project.root);
  const keyframes=new Map<string,{file:string;node:AtRule}>();
  for(const file of files.filter(f=>/\.(css|scss)$/i.test(f))){
    const source=fs.readFileSync(file,'utf8'); const rel=path.relative(project.root,file).split(path.sep).join('/');
    let root; try{root=postcss.parse(source,{from:file});}catch{continue;}
    root.walkAtRules(at=>{if(/keyframes$/i.test(at.name)){keyframes.set(at.params.trim(),{file:rel,node:at});} if(at.name==='media'&&at.params.includes('prefers-reduced-motion'))reducedMotion=true;});
    root.walkRules((rule:Rule)=>{const decls=new Map<string,Declaration>();rule.walkDecls(d=>decls.set(d.prop,d));
      const animationDecl=[...decls].find(([k])=>k==='animation'||k.startsWith('animation-'))?.[1];
      if(animationDecl){const shorthand=decls.get('animation')?.value??'';const name=decls.get('animation-name')?.value??shorthand.split(/\s+/).find(v=>keyframes.has(v));const duration=decls.get('animation-duration')?.value??shorthand.match(/[\d.]+m?s/)?.[0];const loc=animationDecl.source?.start; const frame=name?keyframes.get(name):undefined;
        animations.push({id:`css:${rel}:${loc?.line??0}:${rule.selector}`,elementId:'static:'+rule.selector,type:'css-animation',name,startTime:0,duration:duration?toMs(duration):undefined,delay:toMs(decls.get('animation-delay')?.value),easing:decls.get('animation-timing-function')?.value,iterations:Number(decls.get('animation-iteration-count')?.value)||undefined,direction:decls.get('animation-direction')?.value,fill:decls.get('animation-fill-mode')?.value,properties:frame?extractKeyframeProps(frame.node):[],source:{file:rel,line:loc?.line,column:loc?.column,selector:rule.selector,snippet:animationDecl.toString()},confidence:'exact',runtimeState:'idle'});
      }
      const transitionDecl=[...decls].find(([k])=>k==='transition'||k.startsWith('transition-'))?.[1]; if(transitionDecl){const props=(decls.get('transition-property')?.value??decls.get('transition')?.value.split(/\s+/)[0]??'all').split(',').map(v=>v.trim());const loc=transitionDecl.source?.start;transitions.push({selector:rule.selector,properties:props,source:{file:rel,line:loc?.line,column:loc?.column,selector:rule.selector,snippet:transitionDecl.toString()}});}
    });
  }
  for(const file of files.filter(f=>/\.(m?[jt]sx?)$/i.test(f))){const source=fs.readFileSync(file,'utf8');const rel=path.relative(project.root,file).split(path.sep).join('/');const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
    const scan=(node:ts.Node)=>{let kind:string|undefined;if(ts.isCallExpression(node)){const text=node.expression.getText(sf);if(text.endsWith('.animate'))kind='waapi';else if(text==='requestAnimationFrame')kind='raf';else if(/classList\.(add|remove|toggle)$/.test(text))kind='class-mutation';else if(text.endsWith('.setAttribute'))kind='attribute-mutation';else {const arg=node.arguments.map(a=>a.getText(sf)).join(' ');if([...motionFields].some(f=>arg.includes(f)))kind='animation-library-candidate';}}else if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){const left=node.left.getText(sf);if(/\.style\.(transform|opacity|left|top|width|height|filter)$/.test(left))kind='style-write';}
      if(kind)candidates.push({kind,file:rel,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,snippet:node.getText(sf).slice(0,220)}); ts.forEachChild(node,scan);}; scan(sf);
  }
  return {animations,transitions,candidates,reducedMotion};
}
function toMs(value?:string):number|undefined{if(!value)return undefined;const m=value.trim().match(/^([\d.]+)(ms|s)$/);if(!m)return undefined;return Number(m[1])*(m[2]==='s'?1000:1);}
function extractKeyframeProps(at:AtRule){const out=new Map<string,string[]>();at.walkDecls(d=>{const arr=out.get(d.prop)??[];arr.push(d.value);out.set(d.prop,arr);});return [...out].map(([name,values])=>({name,values}));}

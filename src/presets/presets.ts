export interface AnimationPreset { id:string; label:string; keyframes:Array<Record<string,string|number>>; duration:number; easing:string; }
export const presets: AnimationPreset[] = [
  {id:'fade-in',label:'Fade In',keyframes:[{opacity:0},{opacity:1}],duration:400,easing:'ease-out'},
  {id:'fade-out',label:'Fade Out',keyframes:[{opacity:1},{opacity:0}],duration:400,easing:'ease-in'},
  {id:'fade-up',label:'Fade Up',keyframes:[{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0px)'}],duration:500,easing:'cubic-bezier(.2,.8,.2,1)'},
  {id:'fade-down',label:'Fade Down',keyframes:[{opacity:0,transform:'translateY(-24px)'},{opacity:1,transform:'translateY(0px)'}],duration:500,easing:'ease-out'},
  {id:'slide-in',label:'Slide In',keyframes:[{transform:'translateX(-40px)'},{transform:'translateX(0px)'}],duration:450,easing:'ease-out'},
  {id:'scale-in',label:'Scale In',keyframes:[{opacity:0,transform:'scale(.9)'},{opacity:1,transform:'scale(1)'}],duration:350,easing:'cubic-bezier(.2,.9,.2,1)'},
  {id:'pop',label:'Pop',keyframes:[{transform:'scale(.8)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],duration:420,easing:'ease-out'},
  {id:'blur-in',label:'Blur In',keyframes:[{opacity:0,filter:'blur(12px)'},{opacity:1,filter:'blur(0px)'}],duration:500,easing:'ease-out'},
  {id:'rotate-in',label:'Rotate In',keyframes:[{opacity:0,transform:'rotate(-8deg) scale(.95)'},{opacity:1,transform:'rotate(0deg) scale(1)'}],duration:450,easing:'ease-out'},
  {id:'collapse',label:'Collapse',keyframes:[{opacity:1,transform:'scaleY(1)'},{opacity:0,transform:'scaleY(0)'}],duration:320,easing:'ease-in'}
];

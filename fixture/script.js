import { animateTyped } from './typed-motion.ts';
const box=document.querySelector('#box');
document.querySelector('#waapi').addEventListener('click',()=>box.animate([{transform:'scale(1)',opacity:1},{transform:'scale(1.4)',opacity:.5},{transform:'scale(1)',opacity:1}],{duration:700,easing:'ease-in-out'}));
document.querySelector('#raf').addEventListener('click',()=>{const start=performance.now();const run=t=>{const p=Math.min(1,(t-start)/800);box.style.transform=`translateX(${p*180}px)`;if(p<1)requestAnimationFrame(run)};requestAnimationFrame(run)});
document.querySelector('#style-write').addEventListener('click',()=>{box.style.opacity=box.style.opacity==='0.3'?'1':'0.3';box.style.transform='rotate(12deg)'});
document.querySelector('#modal').addEventListener('click',()=>{document.body.classList.add('modal-open');const backdrop=document.createElement('div');backdrop.className='modal-backdrop';backdrop.innerHTML='<div class="dialog" tabindex="-1"><h2>Dynamic modal</h2><p>Inserted after interaction and animated with CSS.</p><button>Close</button></div>';document.body.append(backdrop);backdrop.querySelector('button').addEventListener('click',()=>{backdrop.remove();document.body.classList.remove('modal-open')});});
window.addEventListener('load',()=>animateTyped(document.querySelector('.responsive')));

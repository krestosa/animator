import './app/styles.css';
import './app/extras.css';
import { mountApp } from './app/app';
import { mountEditorExtras } from './app/extras';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Animator root element not found');

const cleanupApp = mountApp(root);
const cleanupExtras = mountEditorExtras(root);
const cleanup = (): void => { cleanupExtras(); cleanupApp(); };

if (import.meta.hot) import.meta.hot.dispose(cleanup);

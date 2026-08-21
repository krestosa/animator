import './app/styles.css';
import './app/extras.css';
import './app/ui-polish.css';
import { mountApp } from './app/app';
import { mountEditorExtras } from './app/extras';
import { mountUiPolish } from './app/ui-polish';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Animator root element not found');

const cleanupApp = mountApp(root);
const cleanupExtras = mountEditorExtras(root);
const cleanupPolish = mountUiPolish(root);
const cleanup = (): void => { cleanupPolish(); cleanupExtras(); cleanupApp(); };

if (import.meta.hot) import.meta.hot.dispose(cleanup);

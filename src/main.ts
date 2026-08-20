import './app/styles.css';
import { mountApp } from './app/app';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Animator root element not found');

const cleanup = mountApp(root);

if (import.meta.hot) {
  import.meta.hot.dispose(cleanup);
}

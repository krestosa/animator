import './app/styles.css';
import './app/extras.css';
import './app/ui-polish.css';
import './app/timeline-v2.css';
import './app/motion-catalog.css';
import { mountApp } from './app/app';
import { mountEditorExtras } from './app/extras';
import { mountUiPolish } from './app/ui-polish';
import { mountTimelineV2 } from './app/timeline-v2';
import { mountPreviewOrigin } from './app/preview-origin';
import { mountPreviewEditor } from './app/preview-editor';
import { mountMotionCatalog } from './app/motion-catalog';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Animator root element not found');

const cleanupApp = mountApp(root);
const cleanupExtras = mountEditorExtras(root);
const cleanupPolish = mountUiPolish(root);
const cleanupTimeline = mountTimelineV2(root);
const cleanupPreviewOrigin = mountPreviewOrigin(root);
const cleanupPreviewEditor = mountPreviewEditor(root);
const cleanupMotionCatalog = mountMotionCatalog(root);
const cleanup = (): void => { cleanupMotionCatalog(); cleanupPreviewEditor(); cleanupPreviewOrigin(); cleanupTimeline(); cleanupPolish(); cleanupExtras(); cleanupApp(); };

if (import.meta.hot) import.meta.hot.dispose(cleanup);

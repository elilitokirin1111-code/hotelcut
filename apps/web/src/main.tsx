import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { WorkspaceApp } from './workspace/workspace-app';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>,
);

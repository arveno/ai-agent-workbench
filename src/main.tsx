import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/header.css'
import './styles/sidebar.css'
import './styles/chat.css'
import './styles/right-panel.css'
import './styles/model-modal.css'
import './styles/components.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

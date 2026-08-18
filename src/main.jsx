import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './apiAuth' // installs the /api fetch shim (attaches Supabase token) before anything renders
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import { AthenaPermissionProvider } from './contexts/AthenaPermissionContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AthenaPermissionProvider>
        <App />
      </AthenaPermissionProvider>
    </AuthProvider>
  </StrictMode>,
)

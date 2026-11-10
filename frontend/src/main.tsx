import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Pas de StrictMode : son double montage en développement ouvre deux fois la caméra (html5-qrcode).
createRoot(document.getElementById('root')!).render(<App />)

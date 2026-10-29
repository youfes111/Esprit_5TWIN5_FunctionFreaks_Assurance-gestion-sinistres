import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from './design/theme';
import { TooltipProvider } from './components/ui/tooltip';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><MotionConfig reducedMotion="user" transition={{ duration: .22 }}><TooltipProvider><App /></TooltipProvider></MotionConfig></ThemeProvider></StrictMode>);

/* Три поверхности одного приложения на трёх путях: телефон участника,
 * пульт ведущего, экран зала. Роутера нет — путей три и они не меняются. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './app.css';
import { Player } from './Player.tsx';
import { Host } from './Host.tsx';
import { Stage } from './Stage.tsx';
import { Admin } from './Admin.tsx';

function App() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/host') return <Host />;
  if (path === '/screen') return <Stage />;
  if (path === '/admin') return <Admin />;
  return <Player />;
}

/* Экран зала уходит в полноэкранный режим по F: тянуться к меню браузера
 * на глазах у зала ведущему не с руки. */
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey) return;
  if (document.activeElement instanceof HTMLInputElement) return;
  if (location.pathname !== '/screen') return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);

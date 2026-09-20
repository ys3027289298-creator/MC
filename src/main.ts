import './style.css';
import { GameEngine } from './game/engine';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('找不到 #game-canvas');
}

new GameEngine();

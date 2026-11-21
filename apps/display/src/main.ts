import { createGameView } from '@snails/render';
import { DisplayClient } from './net/client';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const view = createGameView(canvas, { tier: 'high' });
window.addEventListener('resize', () => view.resize(window.innerWidth, window.innerHeight));
view.resize(window.innerWidth, window.innerHeight);

const room = new URLSearchParams(location.search).get('room');
if (room) new DisplayClient(`ws://${location.hostname}:3000/ws`, room).connect();

import { createGameView } from '@snails/render';
import { ControllerClient } from './net/client';
import { mountTurnControls } from './ui/turn-controls';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const join = document.getElementById('join') as HTMLFormElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const roomInput = document.getElementById('room') as HTMLInputElement;
roomInput.value = new URLSearchParams(location.search).get('room') ?? '';

join.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (document.getElementById('name') as HTMLInputElement).value;
  const client = new ControllerClient(`ws://${location.host}/ws`, name, roomInput.value);
  client.connect();
  join.remove();

  const view = createGameView(canvas, { tier: 'mobile' });
  const resize = (): void => view.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();
  mountTurnControls(overlay, client);
});

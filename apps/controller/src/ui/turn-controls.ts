import type { ControllerClient } from '../net/client';

/** Placeholder touch controls (aim/power sliders, fire) overlaid on the 3D view. */
export function mountTurnControls(root: HTMLElement, client: ControllerClient): void {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <label>Aim <input id="aim" type="range" min="0" max="180" value="45" /></label>
    <label>Power <input id="power" type="range" min="0" max="100" value="50" /></label>
    <button id="fire">Fire</button>`;
  root.appendChild(panel);

  const aim = panel.querySelector<HTMLInputElement>('#aim')!;
  const power = panel.querySelector<HTMLInputElement>('#power')!;
  const sendAim = (): void =>
    client.send({ type: 'aim', angle: Number(aim.value), power: Number(power.value) / 100 });
  aim.addEventListener('input', sendAim);
  power.addEventListener('input', sendAim);
  panel.querySelector('#fire')!.addEventListener('click', () => client.send({ type: 'fire' }));
}

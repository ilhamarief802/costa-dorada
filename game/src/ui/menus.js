// Title, controls and pause screens. Layered type only, no imagery: the live city is the backdrop.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CONTROL_ROWS = [
  ['WASD', 'Move / drive'],
  ['MOUSE', 'Look, left click fire'],
  ['SHIFT', 'Sprint'],
  ['SPACE', 'Jump / handbrake'],
  ['C', 'Crouch'],
  ['E', 'Enter / exit car'],
  ['F', 'Steal car / start activity'],
  ['1 / 2', 'Pistol / SMG'],
  ['R', 'Reload / restart mission'],
  ['ESC', 'Pause'],
];

export default class Menus {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.buildTitle();
    this.buildControls();
    this.buildPause();
  }

  buildTitle() {
    this.title = element('div', 'menu title-menu');
    const content = element('div', 'title-content');
    content.appendChild(element('div', 'title-kicker', 'A COSTA DORADA STORY'));
    const logo = element('div', 'title-logo');
    logo.append(element('span', 'logo-thin', 'COSTA'), element('span', 'logo-heavy', 'DORADA'));
    content.appendChild(logo);
    content.appendChild(element('div', 'title-sub', 'SUN / SALT / BAD DECISIONS'));

    const buttons = element('div', 'title-buttons');
    this.continueButton = element('button', 'title-button primary', 'CONTINUE');
    this.continueButton.type = 'button';
    this.continueButton.disabled = true;
    this.continueButton.addEventListener('click', () => {
      if (!this.continueButton.disabled) this.options.onContinue?.();
    });
    const newButton = element('button', 'title-button', 'NEW GAME');
    newButton.type = 'button';
    newButton.addEventListener('click', () => this.options.onNewGame?.());
    const controls = element('button', 'title-button', 'CONTROLS');
    controls.type = 'button';
    controls.addEventListener('click', () => this.showControls());
    buttons.append(this.continueButton, newButton, controls);
    content.appendChild(buttons);

    this.seedLine = element('div', 'title-seed', 'SEED 0001 / GOLDEN HOUR');
    content.appendChild(this.seedLine);
    this.title.appendChild(content);
    this.title.appendChild(element('div', 'title-footer', 'WASD MOVE / MOUSE LOOK / F STEAL / E VEHICLE'));
    this.root.appendChild(this.title);
  }

  buildControls() {
    this.controls = element('div', 'menu controls-menu hidden');
    const card = element('div', 'pause-card controls-card');
    card.appendChild(element('div', 'pause-kicker', 'COSTA DORADA'));
    card.appendChild(element('h2', 'pause-title', 'CONTROLS'));
    const list = element('div', 'pause-controls');
    for (const [key, label] of CONTROL_ROWS) {
      const row = element('div', 'control-row');
      row.append(element('span', 'control-key', key), element('span', 'control-label', label));
      list.appendChild(row);
    }
    card.appendChild(list);
    const buttons = element('div', 'pause-buttons');
    const back = element('button', 'pause-button', 'BACK');
    back.type = 'button';
    back.addEventListener('click', () => this.hideControls());
    buttons.appendChild(back);
    card.appendChild(buttons);
    this.controls.appendChild(card);
    this.root.appendChild(this.controls);
  }

  buildPause() {
    this.pause = element('div', 'menu pause-menu hidden');
    const card = element('div', 'pause-card');
    card.appendChild(element('div', 'pause-kicker', 'COSTA DORADA'));
    card.appendChild(element('h2', 'pause-title', 'PAUSED'));
    const buttons = element('div', 'pause-buttons');
    const makeButton = (label, action) => {
      const button = element('button', 'pause-button', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        if (action === 'resume') this.options.onResume?.();
        if (action === 'restart') this.options.onRestart?.();
        if (action === 'quit') this.options.onQuit?.();
      });
      buttons.appendChild(button);
    };
    makeButton('RESUME', 'resume');
    makeButton('RESTART', 'restart');
    makeButton('QUIT TO TITLE', 'quit');
    card.appendChild(buttons);
    const controls = element('div', 'pause-controls');
    for (const [key, label] of CONTROL_ROWS) {
      const row = element('div', 'control-row');
      row.append(element('span', 'control-key', key), element('span', 'control-label', label));
      controls.appendChild(row);
    }
    card.appendChild(controls);
    this.root.appendChild(this.pause);
  }

  setSeed(seed, period) {
    const label = period === 'night' ? 'NIGHT' : 'GOLDEN HOUR';
    this.seedLine.textContent = `SEED ${String(seed).padStart(4, '0')} / ${label}`;
  }

  setSaveAvailable(available) {
    this.continueButton.disabled = !available;
    this.continueButton.textContent = available ? 'CONTINUE' : 'NO SAVE';
  }

  showTitle() {
    this.title.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.controls.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
  }

  showPause() {
    this.pause.classList.remove('hidden');
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }

  showControls() {
    this.controls.classList.remove('hidden');
    this.title.classList.add('hidden');
  }

  hideControls() {
    this.controls.classList.add('hidden');
    this.title.classList.remove('hidden');
  }

  get paused() {
    return !this.pause.classList.contains('hidden');
  }

  get titled() {
    return !this.title.classList.contains('hidden');
  }

  get controlsOpen() {
    return !this.controls.classList.contains('hidden');
  }
}

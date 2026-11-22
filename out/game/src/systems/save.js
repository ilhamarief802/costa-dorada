// Save and load: cash, story progress, wanted level and where the player stood, in localStorage.
// Everything is optional and defensive, so a corrupt or absent save simply starts a new game.
const KEY = 'costaDorada.save.v2';

export function hasSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Boolean(data && data.version === 2);
  } catch {
    return false;
  }
}

export function saveGame(snapshot) {
  try {
    const data = { version: 2, savedAt: Date.now(), ...snapshot };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage can be blocked on file:// in some browsers; nothing to do
  }
}

export default { hasSave, saveGame, loadGame, clearSave, KEY };

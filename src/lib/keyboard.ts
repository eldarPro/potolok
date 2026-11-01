import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// Publishes how much of the screen bottom the on-screen keyboard covers as the CSS variable
// --kb-height on <html>. Bottom sheets and popups lift themselves by it (see theme/global.css),
// so their buttons stay above the keyboard.
//
// Only the part the WebView did NOT already shrink by is counted: if the OS resizes the
// WebView (iOS «native» resize, Android adjustResize) the variable stays ~0 and nothing
// is shifted twice.

const setKb = (px: number) =>
  document.documentElement.style.setProperty('--kb-height', `${Math.max(0, Math.round(px))}px`);

export function initKeyboardInset() {
  setKb(0);

  if (Capacitor.isNativePlatform()) {
    let baseHeight = window.innerHeight; // WebView height while the keyboard is hidden
    let kbHeight = 0;
    const update = () => setKb(kbHeight ? kbHeight - (baseHeight - window.innerHeight) : 0);

    Keyboard.addListener('keyboardWillShow', info => {
      if (!kbHeight) baseHeight = window.innerHeight;
      kbHeight = info.keyboardHeight;
      update();
    });
    Keyboard.addListener('keyboardWillHide', () => { kbHeight = 0; update(); });
    // the WebView may get resized after keyboardWillShow — recompute the remaining overlap
    window.addEventListener('resize', () => {
      if (kbHeight) update(); else baseHeight = window.innerHeight;
    });
    return;
  }

  // Mobile browser: the visual viewport shrinks while the layout viewport stays put
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => setKb(window.innerHeight - vv.height - vv.offsetTop);
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}

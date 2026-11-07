import React, { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { backspaceOutline, chevronDownOutline } from 'ionicons/icons';
import './NumPad.css';

// In-app number keypad for sizes. A NumInput never opens the system keyboard: focusing it
// shows this pad at the bottom, OVER the app — nothing is resized, so the drawing never
// re-fits. Whoever holds the fields makes room for it:
//  • pinned fields (manual measure window): the window reserves the pad's height
//    (.numpad-reserve) and the pad can't be hidden — it lives as long as the fields;
//  • the element card rides up on the pad (see ElementCard), the canvas pans if needed;
//  • scrolling lists get bottom padding (html.numpad-open) and the field is scrolled clear.
// The pad publishes its height as --numpad-h and html.numpad-open while shown.

export interface PadAction {
  label: React.ReactNode;
  /** shown above the label */
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

export interface NumInputProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  /** the pad left this field (another field focused, pad closed) — commit here */
  onBlur?: () => void;
  /** «Готово» on the pad / Enter */
  onEnter?: () => void;
  /** Escape on a hardware keyboard */
  onEscape?: () => void;
  placeholder?: string;
  /** allow a decimal separator */
  decimal?: boolean;
  /** what's being typed, shown in the pad's header */
  label?: React.ReactNode;
  /** replace «Назад»/«Далее» with own keys (up to 3: two in the right column + bottom-right) */
  actions?: PadAction[];
  autoFocus?: boolean;
  /** the pad stays while this field is mounted: no «hide» key, a tap elsewhere doesn't close it */
  pinned?: boolean;
  /** a tap elsewhere doesn't close the pad (it still has the «hide» key) */
  sticky?: boolean;
  /** a field of this group mounting right after the active one unmounted takes the pad over
   *  (the element card is re-created for every picked element) */
  group?: string;
  /** label of «Готово» on the last field, e.g. «Построить» */
  enterLabel?: string;
  enterDisabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  inputRef?: React.Ref<HTMLInputElement>;
  'aria-label'?: string;
}

// ── Store: which field the pad is typing into ────────────────────────────

interface Field { el: HTMLInputElement; props: React.MutableRefObject<NumInputProps>; fresh: boolean }

let active: Field | null = null;
const fields = new Map<HTMLInputElement, React.MutableRefObject<NumInputProps>>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;
let padHeight = 0;
let handoff: { group: string; until: number } | null = null;

/** true while the pad is shown */
export const useNumPadOpen = () => useSyncExternalStore(subscribe, isOpen);
const isOpen = () => active != null;

/** the field the pad types into */
export const useNumPadActive = () => useSyncExternalStore(subscribe, getActiveEl);
const getActiveEl = () => active?.el ?? null;

/** the pad's height in px (0 while hidden) */
export const useNumPadHeight = () => useSyncExternalStore(subscribe, getPadHeight);
const getPadHeight = () => (active ? padHeight : 0);

const scrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
};

/** scroll the field clear of the pad (it lies over the app, nothing shrinks) */
const ensureVisible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  const sc = scrollParent(el);
  if (!sc) return;
  const limit = window.innerHeight - padHeight - 12;
  const top = sc.getBoundingClientRect().top + 8;
  if (r.bottom > limit) sc.scrollBy({ top: r.bottom - limit, behavior: 'smooth' });
  else if (r.top < top) sc.scrollBy({ top: r.top - top, behavior: 'smooth' });
};

const visibleFields = () =>
  [...fields.keys()]
    .filter(el => el.isConnected && el.offsetParent != null)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

const activate = (el: HTMLInputElement) => {
  const props = fields.get(el);
  if (!props) return;
  if (active?.el === el) return;
  const prev = active;
  active = { el, props, fresh: true };
  if (prev) mark(prev.el, false);
  mark(el, true);
  prev?.props.current.onBlur?.();
  props.current.onFocus?.();
  emit();
  // once the pad (and a card riding on it) has slid in
  setTimeout(() => { if (active?.el === el) ensureVisible(el); }, props.current.pinned ? 30 : 260);
};

/** data-numpad="active" on the field being typed into, "fresh" while the first key will replace its value */
const mark = (el: HTMLInputElement, on: boolean, fresh = true) => {
  if (on) el.dataset.numpad = fresh ? 'fresh' : 'active';
  else delete el.dataset.numpad;
};

const close = (silent = false) => {
  if (!active) return;
  const prev = active;
  active = null;
  mark(prev.el, false);
  if (document.activeElement === prev.el) prev.el.blur();
  if (!silent) prev.props.current.onBlur?.();
  emit();
};

const move = (d: 1 | -1) => {
  if (!active) return;
  const list = visibleFields();
  const next = list[list.indexOf(active.el) + d];
  if (next) next.focus();
};

const done = () => {
  if (!active) return;
  const list = visibleFields();
  const next = list[list.indexOf(active.el) + 1];
  if (next) { next.focus(); return; }
  const p = active.props.current;
  if (p.enterDisabled) return;
  if (!p.pinned) close();
  p.onEnter?.();
};

const MAX_LEN = 7;

const press = (key: string) => {
  if (!active) return;
  const { props, el } = active;
  const p = props.current;
  const cur = active.fresh ? '' : p.value;
  let next = cur;
  if (key === 'back') next = active.fresh ? '' : cur.slice(0, -1);
  else if (key === '.') {
    if (!p.decimal || /[.,]/.test(cur)) return;
    next = (cur || '0') + '.';
  } else if (/^\d+$/.test(key)) {
    if (cur.replace(/[.,]/, '').length + key.length > MAX_LEN) return;
    next = cur === '0' || (cur === '' && key === '00') ? key.slice(0, 1) : cur + key;
  }
  if (active.fresh) { active.fresh = false; mark(el, true, false); }
  if (next !== p.value) p.onChange(next);
  emit();
};

// ── Field ────────────────────────────────────────────────────────────────

export const NumInput: React.FC<NumInputProps> = props => {
  const ref = useRef<HTMLInputElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useLayoutEffect(() => {
    const el = ref.current!;
    fields.set(el, propsRef);
    const g = propsRef.current.group;
    if (g && handoff?.group === g && handoff.until > performance.now()) {
      handoff = null;
      el.focus({ preventScroll: true });
      activate(el);
    }
    return () => {
      fields.delete(el);
      mark(el, false);
      if (active?.el !== el) return;
      active = null;
      const group = propsRef.current.group;
      if (group) {
        // a field of the same group may mount in this commit — let it take the pad over
        // before the pad is hidden
        handoff = { group, until: performance.now() + 150 };
        setTimeout(() => { if (!active) emit(); }, 0);
      } else emit();
    };
  }, []);

  // the pad shows this field's label/actions — refresh it when they change
  useEffect(() => { if (active?.el === ref.current) emit(); });

  useEffect(() => {
    if (!props.autoFocus) return;
    const el = ref.current!;
    // already focused (StrictMode re-mount) → no focus event, open the pad directly
    if (document.activeElement === el) activate(el); else el.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRef = (el: HTMLInputElement | null) => {
    ref.current = el;
    const r = props.inputRef;
    if (typeof r === 'function') r(el);
    else if (r) (r as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };

  return (
    <input
      ref={setRef}
      type="text"
      inputMode="none"
      readOnly
      aria-label={props['aria-label']}
      className={`numin${props.className ? ` ${props.className}` : ''}`}
      style={props.style}
      value={props.value}
      placeholder={props.placeholder}
      onFocus={e => activate(e.currentTarget)}
      // a tap on an already focused field (pad closed with «⌄») reopens the pad
      onClick={e => { if (!active) { activate(e.currentTarget); } }}
      onBlur={e => {
        const to = e.relatedTarget as HTMLInputElement | null;
        if (to && fields.has(to)) return; // the next field's focus takes over
        if (props.pinned || props.sticky) return;
        // focus went nowhere (tap on empty space) or to a non-pad control
        setTimeout(() => {
          const now = document.activeElement as HTMLInputElement | null;
          if (active?.el === e.target && !(now && fields.has(now))) close();
        }, 0);
      }}
      onKeyDown={e => {
        if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('back');
        else if (e.key === '.' || e.key === ',') press('.');
        else if (e.key === 'Enter') done();
        else if (e.key === 'Escape') { props.onEscape?.(); close(!!props.onEscape); }
        else if (e.key === 'Tab') return;
        else return;
        e.preventDefault();
      }}
    />
  );
};

// ── The pad ──────────────────────────────────────────────────────────────

const Key: React.FC<{ className?: string; onPress: () => void; disabled?: boolean; children: React.ReactNode; repeat?: boolean }> =
  ({ className = '', onPress, disabled, children, repeat }) => {
    const timer = useRef<number | null>(null);
    const stop = () => { if (timer.current != null) { clearTimeout(timer.current); timer.current = null; } };
    useEffect(() => stop, []);
    return (
      <button
        type="button"
        className={`npad__key ${className}`}
        disabled={disabled}
        // keep focus in the field: a button taking focus would close the pad
        onPointerDown={e => {
          e.preventDefault();
          if (disabled) return;
          onPress();
          if (repeat) {
            const tick = (ms: number) => { timer.current = window.setTimeout(() => { onPress(); tick(70); }, ms); };
            tick(420);
          }
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={e => { if (e.detail === 0 && !disabled) onPress(); /* keyboard activation */ }}
      >
        {children}
      </button>
    );
  };

export const NumPad: React.FC = () => {
  useSyncExternalStore(subscribe, getVersion);
  const padRef = useRef<HTMLDivElement>(null);
  const open = active != null;

  // publish the pad height
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!open) { root.classList.remove('numpad-open'); root.style.removeProperty('--numpad-h'); return; }
    const pad = padRef.current!;
    const set = () => {
      const h = Math.round(pad.getBoundingClientRect().height);
      root.style.setProperty('--numpad-h', `${h}px`);
      if (h !== padHeight) { padHeight = h; emit(); }
    };
    set();
    root.classList.add('numpad-open');
    const ro = new ResizeObserver(set);
    ro.observe(pad);
    return () => ro.disconnect();
  }, [open]);

  // hardware «back» hides the pad first (a pinned one goes with its window)
  const pinned = !!active?.props.current.pinned;
  useEffect(() => {
    if (!open || pinned) return;
    const onBack = (e: Event) => (e as CustomEvent).detail.register(300, () => close());
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [open, pinned]);

  if (!active) return null;
  const p = active.props.current;
  const list = visibleFields();
  const idx = list.indexOf(active.el);
  const isLast = idx === list.length - 1;
  const actions = p.actions;

  return createPortal(
    <div className={`npad${p.pinned ? '' : ' npad--slide'}`} ref={padRef} onPointerDown={e => e.preventDefault()}>
      <div className="npad__head">
        <span className="npad__label">{p.label}</span>
        {list.length > 1 && idx >= 0 && <span className="npad__prog">{idx + 1} из {list.length}</span>}
      </div>
      <div className="npad__grid">
        {['1', '2', '3'].map(k => <Key key={k} onPress={() => press(k)}>{k}</Key>)}
        <Key className="npad__key--fn" onPress={() => press('back')} repeat><IonIcon icon={backspaceOutline} /></Key>
        {['4', '5', '6'].map(k => <Key key={k} onPress={() => press(k)}>{k}</Key>)}
        {actions ? (
          <ActionKey a={actions[0]} />
        ) : (
          <Key className="npad__key--fn" onPress={() => move(-1)} disabled={idx <= 0}>‹ Назад</Key>
        )}
        {['7', '8', '9'].map(k => <Key key={k} onPress={() => press(k)}>{k}</Key>)}
        {actions ? (
          <ActionKey a={actions[1]} />
        ) : (
          <Key className={`npad__key--go${isLast && p.enterLabel ? ' npad__key--enter' : ''}`} onPress={done} disabled={isLast && p.enterDisabled}>
            {isLast ? p.enterLabel ?? 'Готово' : 'Далее ›'}
          </Key>
        )}
        {p.pinned
          ? <Key onPress={() => press('00')}>00</Key>
          : <Key className="npad__key--fn" onPress={() => close()}><IonIcon icon={chevronDownOutline} /></Key>}
        <Key onPress={() => press('0')}>0</Key>
        <Key className="npad__key--fn" onPress={() => press('.')} disabled={!p.decimal}>,</Key>
        {actions && <ActionKey a={actions[2]} />}
      </div>
    </div>,
    document.body,
  );
};

const ActionKey: React.FC<{ a?: PadAction }> = ({ a }) =>
  a ? (
    <Key className={`npad__key--stack ${a.primary ? 'npad__key--act' : 'npad__key--fn'}`} onPress={a.onClick} disabled={a.disabled}>
      {a.icon && <span className="npad__key-icon">{a.icon}</span>}
      <span>{a.label}</span>
    </Key>
  ) : <span />;

export default NumPad;

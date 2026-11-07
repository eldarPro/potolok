import React, { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { backspaceOutline, chevronDownOutline } from 'ionicons/icons';
import './NumPad.css';

// In-app number keypad for sizes. A NumInput never opens the system keyboard: focusing it
// docks this pad at the bottom and shrinks the app above it once (html.numpad-open, see
// NumPad.css). Moving between fields keeps the pad open, so the layout doesn't jump on
// every field the way the system keyboard did.

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

/** true while the pad is shown */
export const useNumPadOpen = () => useSyncExternalStore(subscribe, isOpen);
const isOpen = () => active != null;

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
  // after the app has shrunk above the pad
  setTimeout(() => { if (active?.el === el) el.scrollIntoView({ block: 'nearest' }); }, 30);
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
  const onEnter = active.props.current.onEnter;
  close();
  onEnter?.();
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
  } else if (/^\d$/.test(key)) {
    if (cur.replace(/[.,]/, '').length >= MAX_LEN) return;
    next = cur === '0' ? key : cur + key;
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
    return () => {
      fields.delete(el);
      if (active?.el === el) { active = null; emit(); }
      mark(el, false);
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

  // publish the pad height and shrink the app above it
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!open) { root.classList.remove('numpad-open'); root.style.removeProperty('--numpad-h'); return; }
    const pad = padRef.current!;
    const set = () => root.style.setProperty('--numpad-h', `${Math.round(pad.getBoundingClientRect().height)}px`);
    set();
    root.classList.add('numpad-open');
    const ro = new ResizeObserver(set);
    ro.observe(pad);
    return () => ro.disconnect();
  }, [open]);

  // hardware «back» hides the pad first
  useEffect(() => {
    if (!open) return;
    const onBack = (e: Event) => (e as CustomEvent).detail.register(300, () => close());
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [open]);

  if (!active) return null;
  const p = active.props.current;
  const list = visibleFields();
  const idx = list.indexOf(active.el);
  const isLast = idx === list.length - 1;
  const actions = p.actions;

  return createPortal(
    <div className="npad" ref={padRef} onPointerDown={e => e.preventDefault()}>
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
          <Key className="npad__key--go" onPress={done}>{isLast ? 'Готово' : 'Далее ›'}</Key>
        )}
        <Key className="npad__key--fn" onPress={() => close()}><IonIcon icon={chevronDownOutline} /></Key>
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

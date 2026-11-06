import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { trashOutline, refreshOutline, checkmarkOutline } from 'ionicons/icons';
import { useT } from '../lib/i18n';
import './Dialogs.css';

// Brand replacements for Ionic's alert / action sheet, so every popup in the app looks the same:
//   if (await confirm({...})) doIt()            — centred card for destructive actions
//   menu({ title, items: [...] })               — bottom sheet of actions (the ⋮ menus)
//   const v = await prompt({ fields: [...] })   — centred card with inputs (rename, add line…)

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  /** text of the action button, e.g. «Удалить» */
  confirmText: string;
  /** danger = red (delete), warning = amber (clear / reset) */
  tone?: 'danger' | 'warning';
  /** ionicon; defaults to a trash can for danger, a reset arrow for warning */
  icon?: string;
  /** dark variant for the dark screens (room editor, visualization) */
  dark?: boolean;
}

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  /** shows a check mark (e.g. the current language) */
  selected?: boolean;
  /** a colored dot instead of an icon (e.g. a project status); also tints the check mark */
  dot?: string;
  /** smaller second line under the label */
  hint?: string;
  onClick: () => void;
}

export interface MenuOptions {
  title?: string;
  subtitle?: string;
  items: MenuItem[];
  dark?: boolean;
}

export interface PromptField {
  name: string;
  label?: string;
  placeholder?: string;
  value?: string;
  type?: 'text' | 'number' | 'tel';
  /** the save button stays disabled while this field is blank */
  required?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  fields: PromptField[];
  confirmText: string;
  /** an extra red text button at the bottom (e.g. «Удалить» while editing a line) */
  destructive?: { text: string; onClick: () => void };
  dark?: boolean;
}

type Values = Record<string, string>;

type Request =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'menu'; opts: MenuOptions; resolve: (item: MenuItem | null) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: Values | null) => void };

interface Api {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  menu: (o: MenuOptions) => void;
  prompt: (o: PromptOptions) => Promise<Values | null>;
}

const Ctx = createContext<Api>({
  confirm: () => Promise.resolve(false),
  menu: () => {},
  prompt: () => Promise.resolve(null),
});

export const useConfirm = () => useContext(Ctx).confirm;
export const useMenu = () => useContext(Ctx).menu;
export const usePrompt = () => useContext(Ctx).prompt;

const cancelValue = (r: Request) => { (r.resolve as (v: null | false) => void)(r.kind === 'confirm' ? false : null); };

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shown, setShown] = useState<Request | null>(null);
  const [closing, setClosing] = useState(false);
  const current = useRef<Request | null>(null);

  const open = useCallback((r: Request) => {
    if (current.current) cancelValue(current.current);
    current.current = r;
    setClosing(false);
    setShown(r);
  }, []);

  const close = useCallback((settle: (r: Request) => void) => {
    const r = current.current;
    if (!r) return;
    current.current = null;
    setClosing(true);
    settle(r);
    // let the closing animation play, unless another popup opened meanwhile
    setTimeout(() => { if (!current.current) { setShown(null); setClosing(false); } }, 170);
  }, []);

  const api = useRef<Api>({
    confirm: opts => new Promise(resolve => open({ kind: 'confirm', opts, resolve })),
    menu: opts => {
      new Promise<MenuItem | null>(resolve => open({ kind: 'menu', opts, resolve }))
        .then(item => item?.onClick());
    },
    prompt: opts => new Promise(resolve => open({ kind: 'prompt', opts, resolve })),
  }).current;

  const cancel = useCallback(() => close(cancelValue), [close]);

  // Esc / Android back close the popup instead of leaving the page
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const onBack = (e: Event) => (e as CustomEvent).detail.register(1000, cancel);
    document.addEventListener('keydown', onKey);
    document.addEventListener('ionBackButton', onBack);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('ionBackButton', onBack); };
  }, [shown, cancel]);

  let body: React.ReactNode = null;
  if (shown?.kind === 'confirm') {
    body = <ConfirmCard opts={shown.opts} onCancel={cancel}
      onOk={() => close(r => (r as Extract<Request, { kind: 'confirm' }>).resolve(true))} />;
  } else if (shown?.kind === 'menu') {
    body = <MenuSheet opts={shown.opts} onCancel={cancel}
      onPick={item => close(r => (r as Extract<Request, { kind: 'menu' }>).resolve(item))} />;
  } else if (shown?.kind === 'prompt') {
    body = <PromptCard opts={shown.opts} onCancel={cancel}
      onOk={v => close(r => (r as Extract<Request, { kind: 'prompt' }>).resolve(v))}
      onDestructive={() => { const d = shown.opts.destructive; cancel(); d?.onClick(); }} />;
  }

  const dark = shown?.opts.dark;
  const sheet = shown?.kind === 'menu';
  return (
    <Ctx.Provider value={api}>
      {children}
      {shown && createPortal(
        <div className={`dlg${sheet ? ' dlg--sheet' : ''}${dark ? ' dlg--dark' : ''}${closing ? ' dlg--closing' : ''}`}>
          <div className="dlg__backdrop" onClick={cancel} />
          {body}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
};

// ═══ Confirmation card ═══
const ConfirmCard: React.FC<{ opts: ConfirmOptions; onOk: () => void; onCancel: () => void }> = ({ opts, onOk, onCancel }) => {
  const { t } = useT();
  const okRef = useRef<HTMLButtonElement>(null);
  const tone = opts.tone ?? 'danger';
  useEffect(() => { okRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="dlg__card" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className={`dlg__icon dlg__icon--${tone}`}>
        <IonIcon icon={opts.icon ?? (tone === 'danger' ? trashOutline : refreshOutline)} />
      </div>
      <h3 id="dlg-title" className="dlg__title">{opts.title}</h3>
      {opts.message && <p className="dlg__msg">{opts.message}</p>}
      <div className="dlg__btns">
        <button className="dlg__btn dlg__btn--cancel" onClick={onCancel}>{t('common.cancel')}</button>
        <button ref={okRef} className={`dlg__btn dlg__btn--${tone}`} onClick={onOk}>{opts.confirmText}</button>
      </div>
    </div>
  );
};

// ═══ Bottom action sheet ═══
const MenuSheet: React.FC<{ opts: MenuOptions; onPick: (item: MenuItem) => void; onCancel: () => void }> = ({ opts, onPick, onCancel }) => {
  const { t } = useT();
  return (
    <div className="dlg__sheet" role="dialog" aria-modal="true">
      <div className="dlg__grab" />
      {(opts.title || opts.subtitle) && (
        <div className="dlg__sheet-head">
          {opts.title && <div className="dlg__sheet-title">{opts.title}</div>}
          {opts.subtitle && <div className="dlg__sheet-sub">{opts.subtitle}</div>}
        </div>
      )}
      <div className="dlg__items">
        {opts.items.map((it, i) => (
          <button key={i} className={`dlg__item${it.danger ? ' dlg__item--danger' : ''}${it.selected ? ' dlg__item--selected' : ''}`}
            style={it.dot ? { '--dlg-dot': it.dot } as React.CSSProperties : undefined}
            onClick={() => onPick(it)}>
            {it.icon && <span className="dlg__item-icon"><IonIcon icon={it.icon} /></span>}
            {it.dot && <span className="dlg__item-icon dlg__item-dot"><i /></span>}
            <span className="dlg__item-label">
              {it.label}
              {it.hint && <small className="dlg__item-hint">{it.hint}</small>}
            </span>
            {it.selected && <IonIcon className="dlg__item-check" icon={checkmarkOutline} />}
          </button>
        ))}
      </div>
      <button className="dlg__btn dlg__btn--cancel dlg__sheet-cancel" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
  );
};

// ═══ Card with inputs ═══
const PromptCard: React.FC<{
  opts: PromptOptions; onOk: (v: Values) => void; onCancel: () => void; onDestructive: () => void;
}> = ({ opts, onOk, onCancel, onDestructive }) => {
  const { t } = useT();
  const [values, setValues] = useState<Values>(() => Object.fromEntries(opts.fields.map(f => [f.name, f.value ?? ''])));
  const firstRef = useRef<HTMLInputElement>(null);
  const valid = opts.fields.every(f => !f.required || values[f.name]?.trim());

  useEffect(() => {
    // after the pop-in, so the mobile keyboard doesn't fight the animation
    const id = setTimeout(() => { firstRef.current?.focus(); firstRef.current?.select(); }, 120);
    return () => clearTimeout(id);
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (valid) onOk(values);
  };

  return (
    <form className="dlg__card dlg__card--form" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onSubmit={submit}>
      <h3 id="dlg-title" className="dlg__title">{opts.title}</h3>
      {opts.message && <p className="dlg__msg">{opts.message}</p>}
      <div className="dlg__fields">
        {opts.fields.map((f, i) => (
          <label key={f.name} className="dlg__field">
            {f.label && <span className="dlg__field-label">{f.label}</span>}
            <input
              ref={i === 0 ? firstRef : undefined}
              className="dlg__input"
              type={f.type ?? 'text'}
              enterKeyHint={i === opts.fields.length - 1 ? 'done' : 'next'}
              placeholder={f.placeholder}
              value={values[f.name]}
              onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="dlg__btns">
        <button type="button" className="dlg__btn dlg__btn--cancel" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="dlg__btn dlg__btn--primary" disabled={!valid}>{opts.confirmText}</button>
      </div>
      {opts.destructive && (
        <button type="button" className="dlg__link-danger" onClick={onDestructive}>
          <IonIcon icon={trashOutline} />{opts.destructive.text}
        </button>
      )}
    </form>
  );
};

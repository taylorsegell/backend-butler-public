import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../hass/context';
import { getAppearanceAccent, normalizeAccent, setAppearanceAccent, subscribeAppearance } from '../lib/appearance';

function currentAccent(host: HTMLElement | null): string {
  const value = host ? getComputedStyle(host).getPropertyValue('--lk-accent').trim() : '';
  const hex = normalizeAccent(value);
  if (hex) return hex;
  // Themes can provide rgb(), hsl(), or color-mix(). The native picker needs hex.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return '#4C8DFF';
  context.fillStyle = '#4C8DFF';
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  return '#' + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Personal appearance stays available even when shared People settings cannot load. */
export function AppearanceSettings() {
  const host = useStore().host;
  const custom = useSyncExternalStore(subscribeAppearance, getAppearanceAccent, () => null);
  const [draft, setDraft] = useState(() => custom ?? currentAccent(host));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const editing = useRef(false);
  const localChange = useRef<string | null | undefined>(undefined);
  const id = useId();
  useEffect(() => {
    if (!editing.current) setDraft(custom ?? currentAccent(host));
    if (custom !== localChange.current) setStatus('');
    localChange.current = undefined;
  }, [custom, host]);

  const apply = (value: string | null) => {
    localChange.current = value;
    const saved = setAppearanceAccent(value);
    setStatus(saved ? 'Saved for this browser.' : 'Color applied for now. This browser could not save it.');
    setError(null);
  };
  const commitDraft = () => {
    const normalized = normalizeAccent(draft);
    if (!normalized) {
      setError('Enter a hex color such as #4C8DFF.');
      return;
    }
    apply(normalized);
    setDraft(normalized);
  };
  const useTheme = () => {
    editing.current = false;
    apply(null);
    // The card listener restores the HA token synchronously before this read.
    setDraft(currentAccent(host));
  };

  return (
    <section className="lk-set-sec lk-appearance" aria-labelledby={`${id}-heading`}>
      <h2 className="lk-set-title" id={`${id}-heading`}>Appearance</h2>
      <p className="lk-set-desc">Choose Butler’s accent for this browser. Other devices keep their own setting.</p>
      <fieldset className="lk-appearance-mode">
        <legend className="lk-field-label">Accent color</legend>
        <label className="lk-appearance-option">
          <input type="radio" name={`${id}-mode`} checked={custom === null} onChange={useTheme} />
          <span>Use Home Assistant theme</span>
        </label>
        <label className="lk-appearance-option">
          <input type="radio" name={`${id}-mode`} checked={custom !== null}
            onChange={() => { const color = currentAccent(host); setDraft(color); apply(color); }} />
          <span>Custom color</span>
        </label>
      </fieldset>
      {custom !== null && (
        <form className="lk-appearance-editor" onSubmit={(event) => { event.preventDefault(); commitDraft(); }}>
          <label className="lk-field lk-appearance-picker">
            <span className="lk-field-label">Color picker</span>
            <input type="color" aria-label="Accent color picker" value={custom}
              onChange={(event) => { const color = event.currentTarget.value.toUpperCase(); setDraft(color); apply(color); }} />
          </label>
          <label className="lk-field lk-appearance-hex">
            <span className="lk-field-label">Hex color</span>
            <input className="lk-in" value={draft} maxLength={32} spellCheck={false} autoCapitalize="characters"
              aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              onFocus={() => { editing.current = true; }}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft(value);
                setError(null);
                setStatus('');
                const color = normalizeAccent(value);
                if (color) apply(color);
              }}
              onBlur={() => { editing.current = false; commitDraft(); }} />
          </label>
          <p className="lk-set-desc lk-appearance-hint" id={`${id}-hint`}>Use #RGB or #RRGGBB. Valid colors preview immediately.</p>
          <button className="lk-btn lk-appearance-reset" type="button" onClick={useTheme}>Reset to Home Assistant theme</button>
          {error && <p className="lk-set-err lk-appearance-error" id={`${id}-error`} role="alert">{error}</p>}
        </form>
      )}
      <p className="lk-appearance-status" role="status">{status || (custom === null ? 'Following your Home Assistant theme.' : 'Custom accent is active in this browser.')}</p>
    </section>
  );
}

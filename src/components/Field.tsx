import { cloneElement, type InputHTMLAttributes, type TextareaHTMLAttributes, type VNode } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { EyeIcon, EyeOffIcon } from './Icons';

/** A labelled form control. `children` must be a single input-like element; it receives `id`. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: VNode<any> }) {
  const id = useId();
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      {cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })}
      {hint && (
        <span class="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  const [visible, setVisible] = useState(false);
  return (
    <span class="password">
      {visible ? <input {...props} type="text" class="input" /> : <input {...props} type="password" class="input" />}
      <button
        type="button"
        class="password__toggle"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
      </button>
    </span>
  );
}

/**
 * When typing at the end of a growing textarea, scrolls just enough to keep the last line in
 * view. The visual viewport is the part of the page the on-screen keyboard leaves visible.
 */
function keepCaretInView(el: HTMLTextAreaElement) {
  if (document.activeElement !== el || el.selectionEnd !== el.value.length) return;
  const visible = window.visualViewport;
  const visibleBottom = visible ? visible.offsetTop + visible.height : window.innerHeight;
  const hidden = el.getBoundingClientRect().bottom + 12 - visibleBottom;
  if (hidden > 0) window.scrollBy(0, hidden);
}

/** A textarea that grows with its content, keeping what you're typing in view. */
export function AutoTextarea({
  value,
  onValue,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measuring means collapsing the textarea for a moment. Hold the parent's height meanwhile,
    // so the page never gets shorter: if it did, the browser would clamp the scroll position
    // and the text would jump, often behind the keyboard.
    const parent = el.parentElement;
    if (parent) parent.style.minHeight = `${parent.offsetHeight}px`;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
    if (parent) parent.style.minHeight = '';
    keepCaretInView(el);
  }, [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      class={`input textarea ${rest.class ?? ''}`}
      value={value}
      onInput={(e) => onValue((e.target as HTMLTextAreaElement).value)}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      class={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span class="switch__thumb" />
    </button>
  );
}

/** A row of mutually exclusive choices, styled as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

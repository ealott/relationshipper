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

/** A textarea that grows with its content. */
export function AutoTextarea({
  value,
  onValue,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
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

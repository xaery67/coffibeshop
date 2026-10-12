import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  containerClassName?: string;
}

/**
 * Input — field teks design system (DESIGN-SYSTEM §5.2).
 * Label selalu di atas; wajib ditandai `*` + atribut; error via `aria-invalid` + `aria-describedby`.
 * Tinggi ≥ 44px, font ≥ 16px (cegah auto-zoom iOS), radius `rounded-lg`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, id, className = '', containerClassName = '', ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={['space-y-1', containerClassName].filter(Boolean).join(' ')}>
      <label htmlFor={fieldId} className="block text-sm font-semibold text-text">
        {label}
        {required && (
          <span className="ml-0.5 text-error" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={fieldId}
        ref={ref}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm text-text',
          error ? 'border-error' : 'border-border',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
});

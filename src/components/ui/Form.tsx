import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';
import { useI18n } from '../../i18n/I18nProvider';

interface FieldProps {
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  error?: string;
  className?: string;
  /** A single control element, or a render function receiving the a11y props to spread on the control. */
  children: ReactElement<ControlProps> | ((props: ControlProps) => ReactNode);
}

export interface ControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Label + control + help/error text, wired up with ids for screen readers. */
export function Field({ label, optional, help, error, className, children }: FieldProps) {
  const { t } = useI18n();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : help ? helpId : undefined;
  const props: ControlProps = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy };
  const control = typeof children === 'function' ? children(props) : isValidElement(children) ? cloneElement(children, props) : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">({t.common.optional})</span>}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="error-text" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cx('input resize-y leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cx('input appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded border-line-strong accent-[var(--color-primary-fill)]"
        aria-describedby={description ? `${id}-d` : undefined}
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-[13px] text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary-fill' : 'bg-toggle-off',
        )}
      >
        <span
          className={cx(
            'inline-block size-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}

/** Radio-group styled as a segmented control (keyboard accessible via native radios). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex w-full rounded-lg border border-line bg-soft p-1', className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            'relative flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-center text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-semibold text-ink">{children}</h3>
      {aside}
    </div>
  );
}

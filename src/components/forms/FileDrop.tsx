import { useId, useRef, useState, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cx } from '../../lib/cx';

interface FileDropProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  title: ReactNode;
  hint?: ReactNode;
  buttonLabel: string;
  icon?: ReactNode;
  className?: string;
  invalid?: boolean;
}

/** Drag-and-drop area that is also a keyboard/touch-accessible file picker. */
export function FileDrop({ accept, multiple, disabled, onFiles, title, hint, buttonLabel, icon, className, invalid }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cx(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition-colors',
        over ? 'border-primary bg-primary-50' : invalid ? 'border-danger bg-danger-50/40' : 'border-line-strong bg-sunken',
        disabled && 'opacity-60',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-primary-strong ring-1 ring-line">
        {icon ?? <Upload className="size-5" aria-hidden />}
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={cx(
          'mt-4 inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-sunken has-[+input:focus-visible]:outline-2',
          disabled ? 'pointer-events-none' : 'cursor-pointer',
        )}
        tabIndex={disabled ? -1 : 0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {buttonLabel}
      </label>
    </div>
  );
}

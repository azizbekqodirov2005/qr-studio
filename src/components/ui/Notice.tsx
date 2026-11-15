import type { ReactNode } from 'react';
import { CircleCheck, Info, TriangleExclamationPoint, CircleX } from 'lucide-react';
import { cx } from '../../lib/cx';

type Tone = 'info' | 'warning' | 'error' | 'success';

const styles: Record<Tone, string> = {
  info: 'bg-primary-50 border-primary-100 text-info-ink',
  warning: 'bg-warning-50 border-warning-line text-warning',
  error: 'bg-danger-50 border-danger-line text-danger',
  success: 'bg-success-50 border-success-line text-success',
};

const icons = { info: Info, warning: TriangleExclamationPoint, error: CircleX, success: CircleCheck };

export function Notice({ tone = 'info', title, children, className, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div className={cx('flex gap-3 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed', styles[tone], className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? 'mt-0.5' : null, 'opacity-95')}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-primary" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

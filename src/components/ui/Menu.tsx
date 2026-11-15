import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  active?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  width?: string;
  header?: ReactNode;
}

/** Accessible dropdown menu: arrow keys, Home/End, Escape, click-outside. */
export function Menu({ trigger, items, align = 'right', width = 'w-56', header }: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const focusItem = (index: number) => {
    const els = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    if (!els?.length) return;
    els[(index + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    requestAnimationFrame(() => focusItem(Math.max(0, items.findIndex((i) => i.active))));
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const current = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(els.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((o) => !o),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          onKeyDown={onListKey}
          className={cx(
            'absolute z-40 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {header && <div className="border-b border-line px-3 py-2.5">{header}</div>}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cx(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition-colors disabled:opacity-40',
                item.tone === 'danger' ? 'text-danger hover:bg-danger-50 focus:bg-danger-50' : 'text-ink hover:bg-soft focus:bg-soft',
                item.active && 'font-semibold text-primary-strong',
              )}
            >
              {item.icon && <span className="flex size-4 shrink-0 items-center justify-center text-muted [&>svg]:size-4">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

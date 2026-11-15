import { Link } from 'react-router-dom';
import { ArrowRight, CircleQuestionMark } from 'lucide-react';
import { QR_TYPES, isPageType, type QrType } from '../../lib/types';
import { useI18n } from '../../i18n/I18nProvider';
import { TypeIcon } from './typeMeta';
import { cx } from '../../lib/cx';

const cardBase =
  'group relative flex h-full min-h-[148px] flex-col rounded-xl border bg-surface p-5 text-left transition-[border-color,box-shadow,background-color] duration-150';
const cardIdle = 'border-line shadow-card hover:border-primary-200 hover:shadow-raised';
const cardSelected = 'border-primary ring-1 ring-primary shadow-raised';

interface TypeGridProps {
  selected?: QrType;
  /** If provided, cards are buttons; otherwise they link to /create/:type. */
  onSelect?: (type: QrType) => void;
  showHelpCard?: boolean;
  compact?: boolean;
}

export function TypeGrid({ selected, onSelect, showHelpCard = true, compact }: TypeGridProps) {
  const { t } = useI18n();

  const body = (type: QrType) => (
    <>
      <div className="flex items-start justify-between gap-3">
        <TypeIcon type={type} />
        {isPageType(type) && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">{t.types.dynamicBadge}</span>
        )}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{t.types[type].title}</h3>
      <p className={cx('mt-1 text-sm leading-snug text-muted', compact && 'line-clamp-2')}>{t.types[type].desc}</p>
    </>
  );

  return (
    <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4" role="list">
      {QR_TYPES.map((type) => {
        const isSelected = selected === type;
        const className = cx(cardBase, isSelected ? cardSelected : cardIdle);
        return (
          <li key={type}>
            {onSelect ? (
              <button type="button" aria-pressed={isSelected} onClick={() => onSelect(type)} className={cx(className, 'w-full')}>
                {body(type)}
              </button>
            ) : (
              <Link to={`/create/${type}`} className={className} data-testid={`type-card-${type}`}>
                {body(type)}
              </Link>
            )}
          </li>
        );
      })}
      {showHelpCard && (
        <li>
          <Link
            to="/help"
            className={cx(cardBase, 'border-dashed border-line-strong bg-transparent hover:border-primary-200 hover:bg-surface')}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-soft-2 text-muted">
              <CircleQuestionMark className="size-[22px]" strokeWidth={1.9} aria-hidden />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{t.types.helpCard.title}</h3>
            <p className="mt-1 text-sm leading-snug text-muted">{t.types.helpCard.desc}</p>
            <ArrowRight className="absolute bottom-5 right-5 size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" aria-hidden />
          </Link>
        </li>
      )}
    </ul>
  );
}

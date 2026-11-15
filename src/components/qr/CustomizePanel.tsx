import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, ImagePlus, RotateCcw, Trash } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { CORNER_STYLES, DEFAULT_STYLE, DOT_STYLES, type CornerStyle, type DotStyle, type ErrorCorrection, type QrStyle } from '../../lib/types';
import { isBlockingIssue, isValidHex, readabilityIssues } from '../../lib/qr/render';
import { checkImage, LIMITS, logoToDataUrl } from '../../lib/files';
import { Segmented, SectionTitle, Switch } from '../ui/Form';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { cx } from '../../lib/cx';

const PRESETS: { fg: string; bg: string }[] = [
  { fg: '#151923', bg: '#ffffff' },
  { fg: '#2f62eb', bg: '#ffffff' },
  { fg: '#0b3d2e', bg: '#f1f8f4' },
  { fg: '#6d1d3c', bg: '#fff8f3' },
  { fg: '#3b2f8f', bg: '#f4f2ff' },
  { fg: '#7a3e00', bg: '#fff7e6' },
  { fg: '#0c4a6e', bg: '#eef8fc' },
  { fg: '#000000', bg: '#f5f7fc' },
];

export const SIZE_OPTIONS = [512, 1024, 2048, 4096];

/* Small illustrative glyphs for the pattern and corner options. */
function DotGlyph({ type }: { type: DotStyle }) {
  const fill = 'currentColor';
  const cells: [number, number][] = [
    [0, 0], [1, 0], [0, 1], [2, 1], [1, 2], [2, 2], [0, 2],
  ];
  const s = 9;
  const g = 1;
  const shape = (x: number, y: number, i: number) => {
    const px = 3 + x * (s + g);
    const py = 3 + y * (s + g);
    switch (type) {
      case 'dots':
        return <circle key={i} cx={px + s / 2} cy={py + s / 2} r={s / 2} fill={fill} />;
      case 'rounded':
        return <rect key={i} x={px} y={py} width={s} height={s} rx={3} fill={fill} />;
      case 'extra-rounded':
        return <rect key={i} x={px} y={py} width={s} height={s} rx={4.5} fill={fill} />;
      case 'classy':
        return <path key={i} d={`M${px} ${py}h${s - 4}a4 4 0 0 1 4 4v${s - 4}h-${s - 4}a4 4 0 0 1 -4 -4z`} fill={fill} />;
      case 'classy-rounded':
        return <path key={i} d={`M${px} ${py}h${s - 3}a3 3 0 0 1 3 3v${s - 3}h-${s - 3}a3 3 0 0 1 -3 -3z`} fill={fill} transform={`rotate(0)`} />;
      default:
        return <rect key={i} x={px} y={py} width={s + 0.5} height={s + 0.5} fill={fill} />;
    }
  };
  return (
    <svg viewBox="0 0 36 36" className="size-9" aria-hidden>
      {cells.map(([x, y], i) => shape(x, y, i))}
    </svg>
  );
}

function CornerGlyph({ type }: { type: CornerStyle }) {
  const outer = type === 'square' ? 0 : type === 'rounded' ? 5 : 11;
  const inner = type === 'square' ? 0 : type === 'rounded' ? 2.5 : 5;
  return (
    <svg viewBox="0 0 36 36" className="size-9" aria-hidden>
      <rect x="4.5" y="4.5" width="27" height="27" rx={outer} fill="none" stroke="currentColor" strokeWidth="4" />
      <rect x="12" y="12" width="12" height="12" rx={inner} fill="currentColor" />
    </svg>
  );
}

function OptionTile({ selected, onClick, label, children }: { selected: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-[12px] font-medium transition-colors',
        selected ? 'border-primary bg-primary-50 text-primary-strong ring-1 ring-primary' : 'border-line text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      <span className={selected ? 'text-primary-strong' : 'text-ink'}>{children}</span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const invalid = !isValidHex(text);
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className={cx(disabled && 'pointer-events-none opacity-50')}>
      <label htmlFor={`${id}-hex`} className="label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line-strong">
          <input
            type="color"
            aria-label={label}
            value={isValidHex(value) && value.length === 7 ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="absolute -inset-1 size-12 cursor-pointer"
          />
        </span>
        <input
          id={`${id}-hex`}
          className="input font-mono uppercase"
          value={text}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith('#')) v = '#' + v;
            setText(v);
            if (isValidHex(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
      {invalid && <p className="error-text">{t.validation.color}</p>}
    </div>
  );
}

interface Props {
  style: QrStyle;
  onChange: (style: QrStyle) => void;
}

export function CustomizePanel({ style, onChange }: Props) {
  const { t } = useI18n();
  const d = t.design;
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const set = <K extends keyof QrStyle>(key: K, value: QrStyle[K]) => onChange({ ...style, [key]: value });
  const issues = readabilityIssues(style);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    const check = await checkImage(file, LIMITS.logoBytes);
    if (!check.ok) {
      setLogoError(check.reason === 'size' ? t.files.tooLarge(5) : check.reason === 'type' ? t.files.invalidType : t.files.corrupt);
      return;
    }
    setLogoBusy(true);
    try {
      const dataUrl = await logoToDataUrl(file);
      const ecl: ErrorCorrection = style.errorCorrection === 'L' || style.errorCorrection === 'M' ? 'H' : style.errorCorrection;
      onChange({ ...style, logo: dataUrl, errorCorrection: ecl });
    } catch {
      setLogoError(t.files.corrupt);
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="pattern-h">
        <SectionTitle>
          <span id="pattern-h">{d.pattern}</span>
        </SectionTitle>
        <div role="radiogroup" aria-labelledby="pattern-h" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DOT_STYLES.map((s) => (
            <OptionTile key={s} selected={style.dotStyle === s} onClick={() => set('dotStyle', s)} label={d.dotStyles[s]}>
              <DotGlyph type={s} />
            </OptionTile>
          ))}
        </div>
      </section>

      <section aria-labelledby="corner-h">
        <SectionTitle>
          <span id="corner-h">{d.corners}</span>
        </SectionTitle>
        <div role="radiogroup" aria-labelledby="corner-h" className="grid grid-cols-3 gap-2 sm:max-w-sm">
          {CORNER_STYLES.map((s) => (
            <OptionTile key={s} selected={style.cornerStyle === s} onClick={() => set('cornerStyle', s)} label={d.cornerStyles[s]}>
              <CornerGlyph type={s} />
            </OptionTile>
          ))}
        </div>
      </section>

      <section aria-labelledby="colors-h">
        <SectionTitle
          aside={
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeftRight className="size-4" />}
              onClick={() => onChange({ ...style, fgColor: style.bgColor, bgColor: style.fgColor })}
              disabled={style.transparentBg}
            >
              {d.swap}
            </Button>
          }
        >
          <span id="colors-h">{d.colors}</span>
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label={d.foreground} value={style.fgColor} onChange={(v) => set('fgColor', v)} />
          <ColorField label={d.background} value={style.bgColor} onChange={(v) => set('bgColor', v)} disabled={style.transparentBg} />
        </div>
        <div className="mt-4">
          <Switch label={d.transparent} checked={style.transparentBg} onChange={(v) => set('transparentBg', v)} />
        </div>
        <p className="mb-2 mt-5 text-[13px] font-medium text-muted">{d.presets}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = p.fg === style.fgColor.toLowerCase() && p.bg === style.bgColor.toLowerCase() && !style.transparentBg;
            return (
              <button
                key={p.fg + p.bg}
                type="button"
                aria-label={`${p.fg} / ${p.bg}`}
                aria-pressed={active}
                onClick={() => onChange({ ...style, fgColor: p.fg, bgColor: p.bg, transparentBg: false })}
                className={cx(
                  'flex size-10 items-center justify-center rounded-lg border transition-shadow',
                  active ? 'border-primary ring-2 ring-primary-200' : 'border-line hover:border-line-strong',
                )}
                style={{ background: p.bg }}
              >
                <span className="size-4 rounded-[4px]" style={{ background: p.fg }} />
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="logo-h">
        <SectionTitle>
          <span id="logo-h">{d.logo}</span>
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          {style.logo && (
            <span className="flex size-14 items-center justify-center overflow-hidden rounded-lg border border-line bg-soft p-1.5">
              <img src={style.logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            id="qr-logo-input"
            onChange={(e) => onLogo(e.target.files?.[0])}
          />
          <Button variant="secondary" icon={<ImagePlus className="size-4" />} loading={logoBusy} onClick={() => fileRef.current?.click()}>
            {style.logo ? d.replaceLogo : d.uploadLogo}
          </Button>
          {style.logo && (
            <Button variant="ghost" icon={<Trash className="size-4" />} onClick={() => set('logo', null)}>
              {d.removeLogo}
            </Button>
          )}
        </div>
        {logoError ? <p className="error-text">{logoError}</p> : <p className="help">{d.logoHint}</p>}
        {style.logo && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <label htmlFor="logo-size" className="font-medium text-ink">
                {d.logoSize}
              </label>
              <span className="tabular-nums text-muted">{Math.round(style.logoSize * 100)}%</span>
            </div>
            <input
              id="logo-size"
              type="range"
              min={0.1}
              max={0.4}
              step={0.01}
              value={style.logoSize}
              onChange={(e) => set('logoSize', Number(e.target.value))}
              className="w-full accent-[var(--color-primary-fill)]"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="adv-h" className="space-y-5">
        <SectionTitle>
          <span id="adv-h">{d.advanced}</span>
        </SectionTitle>
        <div>
          <p className="label" id="ecl-l">
            {d.errorCorrection}
          </p>
          <Segmented
            label={d.errorCorrection}
            value={style.errorCorrection}
            onChange={(v) => set('errorCorrection', v)}
            options={(['L', 'M', 'Q', 'H'] as const).map((v) => ({ value: v, label: d.ecl[v] }))}
          />
          <p className="help">{d.eclHelp}</p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <label htmlFor="qr-margin" className="font-medium text-ink">
              {d.margin}
            </label>
            <span className="tabular-nums text-muted">{style.marginPercent}%</span>
          </div>
          <input
            id="qr-margin"
            type="range"
            min={0}
            max={12}
            step={1}
            value={style.marginPercent}
            onChange={(e) => set('marginPercent', Number(e.target.value))}
            className="w-full accent-[var(--color-primary-fill)]"
          />
        </div>
        <div>
          <p className="label">{d.size}</p>
          <Segmented
            label={d.size}
            value={String(style.size)}
            onChange={(v) => set('size', Number(v))}
            options={SIZE_OPTIONS.map((s) => ({ value: String(s), label: `${s}` }))}
          />
        </div>
      </section>

      <section aria-live="polite" className="space-y-2">
        {issues.length === 0 ? (
          <Notice tone="success">{d.readable}</Notice>
        ) : (
          issues.map((issue) => (
            <Notice key={issue} tone={isBlockingIssue(issue) ? 'error' : issue === 'logoLowCorrection' || issue === 'transparent' ? 'info' : 'warning'}>
              {d.warnings[issue]}
            </Notice>
          ))
        )}
      </section>

      <div className="border-t border-line pt-5">
        <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => onChange({ ...DEFAULT_STYLE })}>
          {d.resetDesign}
        </Button>
      </div>
    </div>
  );
}

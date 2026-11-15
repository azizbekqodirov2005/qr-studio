import { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { buildQrOptions } from '../../lib/qr/render';
import type { QrStyle } from '../../lib/types';
import { cx } from '../../lib/cx';

interface QrRenderProps {
  content: string;
  style: QrStyle;
  /** Internal render width (SVG scales to the container). */
  renderWidth?: number;
  className?: string;
  label?: string;
  onError?: (error: 'tooLong' | 'render' | null) => void;
}

/**
 * Live QR preview. Uses the same option builder as the export pipeline, so the
 * downloaded file matches what is shown here.
 */
export function QrRender({ content, style, renderWidth = 600, className, label, onError }: QrRenderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const [failed, setFailed] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const options = buildQrOptions(content, style, { width: renderWidth, type: 'svg' });
      try {
        if (!qrRef.current) {
          qrRef.current = new QRCodeStyling(options);
          el.innerHTML = '';
          qrRef.current.append(el);
        } else {
          qrRef.current.update(options);
        }
        const svg = el.querySelector('svg');
        if (svg) {
          svg.setAttribute('role', 'img');
          if (label) svg.setAttribute('aria-label', label);
        }
        setFailed(false);
        onErrorRef.current?.(null);
      } catch (err) {
        const tooLong = String(err).includes('code length overflow');
        setFailed(true);
        onErrorRef.current?.(tooLong ? 'tooLong' : 'render');
        // Library state may be inconsistent after a throw; start fresh next time.
        qrRef.current = null;
        el.innerHTML = '';
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [content, style, renderWidth, label]);

  return (
    <div
      ref={ref}
      className={cx('qr-render aspect-square w-full', failed && 'hidden', className)}
      data-testid="qr-render"
    />
  );
}

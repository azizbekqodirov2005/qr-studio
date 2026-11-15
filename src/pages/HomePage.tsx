import { Download, MousePointerClick, Palette } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { TypeGrid } from '../components/qr/TypeGrid';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function HomePage() {
  const { t } = useI18n();
  const h = t.home;
  useDocumentMeta('', h.subtitle);

  const steps = [
    { icon: MousePointerClick, title: h.step1Title, text: h.step1Text },
    { icon: Palette, title: h.step2Title, text: h.step2Text },
    { icon: Download, title: h.step3Title, text: h.step3Text },
  ];

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="container-page py-12 sm:py-16">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{h.title}</h1>
            <p className="mt-3 text-base leading-relaxed text-muted sm:text-[17px]">{h.subtitle}</p>
          </div>
        </div>
      </section>

      <section className="container-page py-10 sm:py-12" aria-labelledby="types-h">
        <h2 id="types-h" className="mb-5 text-[13px] font-semibold uppercase tracking-wide text-muted">
          {h.chooseType}
        </h2>
        <TypeGrid />
      </section>

      <section className="container-page pb-16" aria-labelledby="how-h">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 id="how-h" className="text-lg font-semibold text-ink">
            {h.howTitle}
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-ink">
                  <s.icon className="size-5" strokeWidth={1.9} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    <span className="mr-1.5 tabular-nums text-subtle">{i + 1}.</span>
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

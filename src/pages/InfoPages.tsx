import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { cx } from '../lib/cx';

export function PricingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const p = t.pricing;
  const f = p.features;
  useDocumentMeta(t.common.pricing, p.subtitle);

  const plans = [
    {
      key: 'guest',
      name: p.guest,
      price: p.guestPrice,
      desc: p.guestDesc,
      features: [f.staticTypes, f.design, f.formats, f.noWatermark],
      cta: <ButtonLink to="/" variant="secondary" block>{p.startNow}</ButtonLink>,
      highlight: false,
    },
    {
      key: 'account',
      name: p.account,
      price: p.accountPrice,
      desc: p.accountDesc,
      features: [f.staticTypes, f.design, f.formats, f.noWatermark, f.uploads, f.pages, f.dashboard, f.editable],
      cta: user ? (
        <ButtonLink to="/dashboard" block>{t.common.myQr}</ButtonLink>
      ) : (
        <ButtonLink to="/signup" block>{p.createAccount}</ButtonLink>
      ),
      highlight: true,
    },
  ];

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-4xl">{p.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">{p.subtitle}</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
        {plans.map((plan) => (
          <section key={plan.key} className={cx('card relative flex flex-col p-6 sm:p-8', plan.highlight && 'border-primary ring-1 ring-primary')}>
            {plan.highlight && (
              <span className="absolute right-5 top-5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-strong">{p.recommended}</span>
            )}
            <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted">{plan.desc}</p>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-ink">{plan.price}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feat) => (
                <li key={feat} className="flex gap-3 text-sm text-ink">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {feat}
                </li>
              ))}
            </ul>
            <div className="mt-8">{plan.cta}</div>
          </section>
        ))}
      </div>
      <div className="mx-auto mt-14 max-w-2xl">
        <h2 className="text-lg font-semibold text-ink">{p.faqTitle}</h2>
        <Faq items={[{ q: p.faq1q, a: p.faq1a }, { q: p.faq2q, a: p.faq2a }]} />
      </div>
    </div>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
      {items.map((item) => (
        <details key={item.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink">
            {item.q}
            <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function HelpPage() {
  const { t } = useI18n();
  const h = t.help;
  useDocumentMeta(t.common.help, h.subtitle);
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-4xl">{h.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">{h.subtitle}</p>
        <Faq items={h.faqs} />
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/">{t.home.title}</ButtonLink>
          <ButtonLink to="/pricing" variant="secondary">
            {t.common.pricing}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

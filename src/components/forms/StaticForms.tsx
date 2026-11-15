import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { Checkbox, Field, Input, Segmented } from '../ui/Form';
import { IconButton } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { FormSection, type FormProps } from './shared';
import { normalizeUrl } from '../../lib/qr/payloads';
import type { UrlData, VCardData, WifiData, WifiSecurity } from '../../lib/types';

export function UrlForm({ value, onChange, errors }: FormProps<UrlData>) {
  const { t } = useI18n();
  const normalized = value.url.trim() ? normalizeUrl(value.url) : null;
  const showResolved = normalized && normalized !== value.url.trim();
  return (
    <div className="space-y-4">
      <Field
        label={t.url.label}
        error={errors.url}
        help={showResolved ? `${t.url.willOpen}: ${normalized}` : t.url.help}
      >
        <Input
          type="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t.url.placeholder}
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          data-autofocus
          name="url"
        />
      </Field>
    </div>
  );
}

export function VCardForm({ value, onChange, errors }: FormProps<VCardData>) {
  const { t } = useI18n();
  const v = t.vcard;
  const set = (key: keyof VCardData) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="space-y-8">
      <FormSection title={v.personal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={v.firstName} error={errors.firstName}>
            <Input autoComplete="given-name" placeholder={v.firstNamePh} value={value.firstName} onChange={set('firstName')} name="firstName" />
          </Field>
          <Field label={v.lastName} optional error={errors.lastName}>
            <Input autoComplete="family-name" placeholder={v.lastNamePh} value={value.lastName} onChange={set('lastName')} name="lastName" />
          </Field>
        </div>
      </FormSection>
      <FormSection title={v.work}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={v.company} optional error={errors.company}>
            <Input autoComplete="organization" placeholder={v.companyPh} value={value.company} onChange={set('company')} name="company" />
          </Field>
          <Field label={v.jobTitle} optional error={errors.jobTitle}>
            <Input autoComplete="organization-title" placeholder={v.jobTitlePh} value={value.jobTitle} onChange={set('jobTitle')} name="jobTitle" />
          </Field>
        </div>
      </FormSection>
      <FormSection title={v.contact}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={v.phone} optional error={errors.phone}>
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder={v.phonePh} value={value.phone} onChange={set('phone')} name="phone" />
          </Field>
          <Field label={v.email} optional error={errors.email}>
            <Input type="email" inputMode="email" autoComplete="email" placeholder={v.emailPh} value={value.email} onChange={set('email')} name="email" />
          </Field>
          <Field label={v.website} optional error={errors.website} className="sm:col-span-2">
            <Input type="url" inputMode="url" autoComplete="url" autoCapitalize="off" placeholder={v.websitePh} value={value.website} onChange={set('website')} name="website" />
          </Field>
        </div>
      </FormSection>
      <FormSection title={v.location}>
        <Field label={v.address} optional error={errors.address}>
          <Input autoComplete="street-address" placeholder={v.addressPh} value={value.address} onChange={set('address')} name="address" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={v.city} optional error={errors.city}>
            <Input autoComplete="address-level2" placeholder={v.cityPh} value={value.city} onChange={set('city')} name="city" />
          </Field>
          <Field label={v.country} optional error={errors.country}>
            <Input autoComplete="country-name" placeholder={v.countryPh} value={value.country} onChange={set('country')} name="country" />
          </Field>
        </div>
      </FormSection>
      <Notice tone="info">{v.scanNote}</Notice>
    </div>
  );
}

export function WifiForm({ value, onChange, errors }: FormProps<WifiData>) {
  const { t } = useI18n();
  const w = t.wifi;
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-5">
      <Field label={w.ssid} error={errors.ssid}>
        <Input
          placeholder={w.ssidPh}
          value={value.ssid}
          onChange={(e) => onChange({ ...value, ssid: e.target.value })}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          name="ssid"
        />
      </Field>
      <div>
        <p className="label">{w.security}</p>
        <Segmented<WifiSecurity>
          label={w.security}
          value={value.security}
          onChange={(security) => onChange({ ...value, security })}
          options={[
            { value: 'WPA', label: w.wpa },
            { value: 'WEP', label: w.wep },
            { value: 'nopass', label: w.none },
          ]}
        />
      </div>
      {value.security !== 'nopass' && (
        <Field label={w.password} error={errors.password}>
          {(a11y) => (
          <div className="relative">
            <Input
              {...a11y}
              type={show ? 'text' : 'password'}
              placeholder={w.passwordPh}
              value={value.password}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="pr-11"
              name="password"
            />
            <IconButton
              label={show ? w.hidePassword : w.showPassword}
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShow((s) => !s)}
              aria-pressed={show}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </IconButton>
          </div>
          )}
        </Field>
      )}
      <Checkbox label={w.hidden} description={w.hiddenHelp} checked={value.hidden} onChange={(e) => onChange({ ...value, hidden: e.target.checked })} />
      <Notice tone="info">{w.compatNote}</Notice>
    </div>
  );
}

import { useEffect } from 'react';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Sets the document title and description / Open Graph tags for the current page. */
export function useDocumentMeta(title: string, description?: string, image?: string | null) {
  useEffect(() => {
    const fullTitle = title ? `${title} · QR Studio` : 'QR Studio';
    document.title = fullTitle;
    setMeta('property', 'og:title', title || 'QR Studio');
    if (description !== undefined) {
      const d = description.slice(0, 200);
      setMeta('name', 'description', d);
      setMeta('property', 'og:description', d);
    }
    if (image) setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', window.location.href);
  }, [title, description, image]);
}

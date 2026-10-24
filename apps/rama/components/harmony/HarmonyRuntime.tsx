'use client';
// Loads Harmony's runtime once and runs ErgOS.mount() after every page change, so folder cards get their
// shape and data-icon spans their icons (design/harmony/developer-guide.md §9).
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

type ErgOS = { mount?: (root?: Element) => void };
const mount = () => (window as unknown as { ErgOS?: ErgOS }).ErgOS?.mount?.();

export function HarmonyRuntime() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    mount();
  }, [pathname, search]);
  return <Script src="/harmony/bundle.js" strategy="afterInteractive" onLoad={mount} />;
}

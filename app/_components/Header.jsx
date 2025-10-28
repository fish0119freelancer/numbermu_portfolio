'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/work', label: 'Work' },
  { href: '/art', label: 'Art' },
  { href: '/', label: 'Gallery' },
  { href: '/type', label: 'Type' },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-soft/60 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center">
          <Image
            src="/images/branding/logo.jpg"
            alt="numbermuu logo"
            width={230}
            height={90}
            priority
            className="h-[110px] w-[260px] object-contain"
          />
        </Link>
        <nav aria-label="主選單">
          <ul className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-accent/80 sm:text-sm">
            {NAV_LINKS.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`rounded-full px-3 py-1 transition-colors duration-200 ${
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'hover:bg-soft/70 hover:text-accent'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

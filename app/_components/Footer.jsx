import Link from 'next/link';

const navigationLinks = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Work', href: '/work' },
  { label: 'Art', href: '/art' },
  { label: 'Type', href: '/type' },
];

const socialLinks = [
  { label: 'Shopee', href: 'https://shopee.tw/cksxxbe', icon: 'Shop' },
  { label: 'Itch.io', href: 'https://cksxxbe.itch.io/', icon: 'Itch' },
  { label: 'Instagram', href: 'https://www.instagram.com/', icon: 'IG' },
];

const contactEmail = 'ishihirosatomi1593587@gmail.com';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-soft/60 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 text-sm text-accent/70 sm:px-8 lg:gap-12 lg:px-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))] md:items-start">
          <div className="max-w-lg space-y-4">
            <h2 className="font-display text-2xl text-accent">Numbermu</h2>
            <p className="leading-relaxed">
              We build meaningful brand and product experiences through strategy, storytelling, and design craft.
              Every detail is shaped to balance aesthetics with measurable impact.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs uppercase tracking-wide text-accent/50">
              <span className="rounded-full border border-soft px-3 py-1">UI / UX</span>
              <span className="rounded-full border border-soft px-3 py-1">Branding</span>
              <span className="rounded-full border border-soft px-3 py-1">Motion</span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-accent">Navigate</h3>
            <ul className="space-y-3 text-accent/70">
              {navigationLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="transition-colors hover:text-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-accent">Connect</h3>
            <div className="space-y-3 text-accent/70">
              <a href={`mailto:${contactEmail}`} className="transition-colors break-words hover:text-brand">
                {contactEmail}
              </a>
              <p className="text-xs uppercase tracking-[0.35em] text-accent/50">
                Replies within 1-2 business days
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-soft/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-accent/60">© {year} Numbermu. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium uppercase tracking-wider text-accent/60">
            {socialLinks.map(({ label, href, icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-soft px-3 py-1 transition hover:border-brand hover:text-brand"
              >
                <span className="text-[0.65rem]">{icon}</span>
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

import localFont from 'next/font/local';
import './globals.css';
import Header from './_components/Header';

const lanaPixel = localFont({
  src: '../fonts/LanaPixel.ttf',
  variable: '--font-lana',
  display: 'swap',
});

const cubic = localFont({
  src: '../fonts/Cubic_11_1.000_R.ttf',
  variable: '--font-cubic',
  display: 'swap',
});

export const metadata = {
  title: 'numbermuu 的作品集',
  description: '以 Next.js 與 Tailwind CSS 打造的 numbermuu 個人作品集網站。',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" className={`${lanaPixel.variable} ${cubic.variable}`}>
      <body className="min-h-screen bg-background text-accent flex flex-col">
        <Header />
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}


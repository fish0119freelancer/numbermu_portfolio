import './globals.css';
import Header from './_components/Header';

export const metadata = {
  title: 'numbermuu 的作品集',
  description: '以 Next.js 與 Tailwind CSS 打造的 numbermuu 個人作品集網站。',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-background text-accent flex flex-col">
        <Header />
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}

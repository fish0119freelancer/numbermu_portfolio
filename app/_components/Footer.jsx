export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-soft/60 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-accent/70">
        版權 © {year} - WordPress 佈景主題由{' '}
        <a href="https://creativethemes.com/" target="_blank" rel="noreferrer noopener" className="text-brand">
          CreativeThemes
        </a>{' '}開發
      </div>
    </footer>
  );
}

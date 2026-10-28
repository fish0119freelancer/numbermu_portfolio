export function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function hasImageUrlBackground(backgroundImage) {
  return /\burl\s*\(/i.test(backgroundImage || '');
}

'use strict';

// Use the same preference and device fallback as the signed-in app.
(() => {
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    let preference;
    try {
      preference = localStorage.getItem('maal-theme');
    } catch {
      // Storage may be unavailable in embedded or restricted browsers.
    }
    const dark = preference === 'dark' || (preference !== 'light' && device.matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = dark ? '#050505' : '#F8F9F6';
  };
  apply();
  device.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === 'maal-theme' || event.key === null) apply();
  });
})();

// Se ejecuta antes de pintar para evitar el destello de tema. Debe coincidir con src/lib/theme.ts
;(function () {
  var pref = 'system'
  try {
    var saved = localStorage.getItem('contigo-theme')
    if (saved === 'light' || saved === 'dark') pref = saved
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#1d1828' : '#fde2e4')
})()

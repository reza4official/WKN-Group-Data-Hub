// Dimuat sinkron di <head> agar tema tersimpan terpasang sebelum render (tanpa kedip).
// Berupa berkas terpisah supaya CSP tetap script-src 'self'.
try {
  var t = localStorage.getItem('wkn-theme')
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t)
} catch (e) {
  /* localStorage dapat diblokir; tema mengikuti sistem */
}

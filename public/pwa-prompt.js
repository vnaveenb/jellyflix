// Must run before the app bundle so the install prompt event is not missed.
window.__deferredPrompt = null
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault()
  window.__deferredPrompt = e
})

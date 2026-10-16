type Listener = (msg: string) => void
const listeners = new Set<Listener>()

/** Show a short message in the app-wide <Toaster />. */
export function toast(msg: string) {
  listeners.forEach((l) => l(msg))
}

export function onToast(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Copy text to the clipboard and confirm with a toast; falls back to execCommand where the async API is blocked. */
export async function copyText(text: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (!ok) return toast('Couldn’t copy')
  }
  toast(done)
}

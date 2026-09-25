import '@testing-library/jest-dom/vitest'

// jsdom no implementa ResizeObserver (lo usan los componentes de Radix, p. ej. Checkbox).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// jsdom no implementa matchMedia (lo usa el hook `useIsMobile` del Sidebar de shadcn).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

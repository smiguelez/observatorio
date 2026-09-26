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

// jsdom no implementa estas APIs de puntero/scroll que Radix Select usa al abrir el combo (008: tests de diálogos con
// selector de provincia). Sin ellas, abrir un `Select` lanza en jsdom.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

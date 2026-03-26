// Vitest global setup — runs before each test file.
// Provides a minimal window.location.origin for services that reference it.
Object.defineProperty(window, "location", {
  value: { origin: "http://localhost:3000", href: "http://localhost:3000/" },
  writable: true,
});

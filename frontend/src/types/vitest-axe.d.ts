/**
 * Type augmentation for vitest-axe.
 *
 * vitest-axe's own extend-expect.d.ts augments the `Vi` global namespace,
 * which only works when Vitest is running with `globals: true` AND tsc
 * resolves the ambient module.  Augmenting the `vitest` module directly
 * is the reliable alternative that works in both `tsc --noEmit` and at
 * runtime regardless of globals config.
 */
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

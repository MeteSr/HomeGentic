/**
 * React 19 type shim for react-helmet-async.
 *
 * react-helmet-async v3 declares Helmet and HelmetProvider as class components
 * using the legacy (props, context) constructor signature. React 19's
 * @types/react tightened JSXElementConstructor — class components must now
 * satisfy `new (props: any) => Component<any>` without the second context arg.
 *
 * Strategy: redirect the `react-helmet-async` path alias (tsconfig paths) to
 * this shim, which re-exports all types from the real subpaths (unaffected by
 * the path alias) but replaces Helmet and HelmetProvider with FC declarations.
 *
 * Runtime is unaffected — Vite resolves the real package as before.
 * Only TypeScript's type-checker uses this file.
 */
import type { FC, PropsWithChildren } from "react";

// Re-export all pure types from the real package subpath.
// react-helmet-async/lib/* is NOT remapped by the tsconfig paths alias, so
// these imports resolve directly to node_modules.
export type {
  Attributes,
  BodyProps,
  HelmetDatum,
  HelmetHTMLBodyDatum,
  HelmetHTMLElementDatum,
  HelmetProps,
  HelmetServerState,
  HelmetTags,
  HtmlProps,
  LinkProps,
  MetaProps,
  StateUpdate,
  TagList,
  TitleProps,
} from "react-helmet-async/lib/types";
export { default as HelmetData } from "react-helmet-async/lib/HelmetData";

// Redeclare Helmet and HelmetProvider as function components so they satisfy
// React 19's JSXElementConstructor constraint.
import type { HelmetProps } from "react-helmet-async/lib/types";
import type { HelmetServerState } from "react-helmet-async/lib/types";

export declare const Helmet: FC<PropsWithChildren<HelmetProps>>;

export interface HelmetProviderProps {
  context?: {
    helmet?: HelmetServerState | null;
  };
}
export declare const HelmetProvider: FC<PropsWithChildren<HelmetProviderProps>>;

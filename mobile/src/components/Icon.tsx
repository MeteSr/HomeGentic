import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Stroke icons from the v3 design (24×24 viewBox, round caps and joins).
const SHAPES = {
  chevronDown: <Path d="m6 9 6 6 6-6" />,
  chevronRight: <Path d="m9 6 6 6-6 6" />,
  home: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1.5" />
      <Rect x="14" y="3" width="7" height="7" rx="1.5" />
      <Rect x="3" y="14" width="7" height="7" rx="1.5" />
      <Rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  property: (
    <>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  jobs: (
    <>
      <Rect x="2" y="7" width="20" height="14" rx="2" />
      <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  upkeep: (
    <>
      <Path d="M14.7 6.3a4 4 0 0 1 5 5l-9 9-5-5 9-9Z" />
      <Path d="m9.5 6.5 8 8" />
    </>
  ),
  account: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="10" cy="7" r="4" />
      <Path d="M20 8v6" />
      <Path d="M23 11h-6" />
    </>
  ),
  user: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="10" cy="7" r="4" />
    </>
  ),
  leads: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="4" />
    </>
  ),
  sign: (
    <>
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  earnings: (
    <>
      <Path d="M12 2v20" />
      <Path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  mic: (
    <>
      <Rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <Path d="M12 18v3.5" />
    </>
  ),
  send: (
    <>
      <Path d="M12 19V5" />
      <Path d="m5 12 7-7 7 7" />
    </>
  ),
  close: (
    <>
      <Path d="M5 5l14 14" />
      <Path d="M19 5 5 19" />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </>
  ),
  back: (
    <>
      <Path d="M19 12H6" />
      <Path d="m12 5-7 7 7 7" />
    </>
  ),
  check: <Path d="m5 13 4.5 4.5L19 7" />,
  globe: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M3 12h18" />
      <Path d="M12 3a14 14 0 0 1 0 18" />
      <Path d="M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  external: (
    <>
      <Path d="M14 4h6v6" />
      <Path d="M20 4 10 14" />
      <Path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
} as const;

export type IconName = keyof typeof SHAPES;

export function Icon({
  name,
  size = 19,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SHAPES[name]}
    </Svg>
  );
}

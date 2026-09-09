import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { palette } from '../theme';

/**
 * A hand-drawn icon set rather than a font.
 *
 * Every glyph is a 24-grid stroked path, so they all share one weight and one
 * corner radius. An icon font would have been faster but would drift in weight
 * against this typography, and these are the only shapes the app needs.
 */
export type IconName =
  | 'arrowUpRight'
  | 'arrowDownLeft'
  | 'plus'
  | 'minus'
  | 'scan'
  | 'home'
  | 'card'
  | 'history'
  | 'search'
  | 'bell'
  | 'lock'
  | 'settings'
  | 'tune'
  | 'user'
  | 'users'
  | 'ruler'
  | 'layers'
  | 'flow'
  | 'tag'
  | 'camera'
  | 'image'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'back'
  | 'eye'
  | 'eyeOff'
  | 'filter'
  | 'sparkle'
  | 'box'
  | 'clipboard'
  | 'receipt'
  | 'trend'
  | 'phone'
  | 'pin'
  | 'more'
  | 'trash'
  | 'edit';

const PATHS: Record<IconName, React.ReactNode> = {
  arrowUpRight: <Path d="M7 17 17 7M9 7h8v8" />,
  arrowDownLeft: <Path d="M17 7 7 17M15 17H7V9" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  scan: (
    <>
      <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <Path d="M4 12h16" />
    </>
  ),
  home: <Path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  card: (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={3} />
      <Path d="M3 10.5h18" />
    </>
  ),
  history: (
    <>
      <Path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <Path d="M3 4v4h4" />
      <Path d="M12 8v4.5l3 1.8" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m20 20-3.6-3.6" />
    </>
  ),
  bell: <Path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9ZM10 18.5a2 2 0 0 0 4 0" />,
  /** A padlock, for a password. */
  lock: (
    <>
      <Rect x={4} y={10.5} width={16} height={10.5} rx={2.4} />
      <Path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3.2} />
      <Path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3.6v-.2a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  /** Sliders — used for the admin area, which is about configuration. */
  tune: (
    <>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx={16} cy={7} r={2.2} />
      <Circle cx={10} cy={17} r={2.2} />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={3.6} />
      <Path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <Circle cx={9} cy={8} r={3.2} />
      <Path d="M3 19.5a6.2 6.2 0 0 1 12 0M16 5.4a3.2 3.2 0 0 1 0 5.2M17.5 13.6A6.2 6.2 0 0 1 21 19.5" />
    </>
  ),
  ruler: (
    <>
      <Rect x={2.5} y={8} width={19} height={8} rx={2} />
      <Path d="M7 8v3M11 8v4.5M15 8v3M19 8v4.5" />
    </>
  ),
  layers: <Path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3ZM4 12.5 12 17l8-4.5M4 17 12 21.5 20 17" />,
  flow: (
    <>
      <Rect x={3} y={4} width={7} height={5} rx={1.6} />
      <Rect x={14} y={15} width={7} height={5} rx={1.6} />
      <Path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
    </>
  ),
  tag: (
    <>
      <Path d="M3 11V4.5A1.5 1.5 0 0 1 4.5 3H11l9.5 9.5a1.6 1.6 0 0 1 0 2.2l-6.8 6.8a1.6 1.6 0 0 1-2.2 0L3 11Z" />
      <Circle cx={7.5} cy={7.5} r={1.3} />
    </>
  ),
  camera: (
    <>
      <Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <Circle cx={12} cy={13} r={3.4} />
    </>
  ),
  image: (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="m4 17 5-5 4 3.5 3-2.5 4 4" />
      <Circle cx={8.5} cy={9.5} r={1.4} />
    </>
  ),
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <Path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  chevronLeft: <Path d="M14.5 5.5 8 12l6.5 6.5" />,
  back: <Path d="M20 12H4.5M11 5.5 4.5 12 11 18.5" />,
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  eyeOff: <Path d="M4 4l16 16M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.3 4M6.4 8.1A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.4-.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  filter: <Path d="M3.5 6h17M6.5 12h11M10 18h4" />,
  sparkle: <Path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3l-1.8-5.7L4.5 10.8 10.2 9 12 3.5ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />,
  box: (
    <>
      <Path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z" />
      <Path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  clipboard: (
    <>
      <Rect x={5} y={5} width={14} height={16} rx={2.5} />
      <Path d="M9 5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1M9 11h6M9 15h4" />
    </>
  ),
  // A till slip with a torn bottom edge — a bill, which is what an expense
  // arrives as.
  receipt: (
    <>
      <Path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Z" />
      <Path d="M9.5 8h5M9.5 12h5" />
    </>
  ),
  trend: <Path d="M3.5 17 9 11l3.5 3.5L20.5 6M15.5 6h5v5" />,
  phone: <Path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />,
  pin: (
    <>
      <Path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <Circle cx={12} cy={10} r={2.6} />
    </>
  ),
  more: (
    <>
      <Circle cx={5.5} cy={12} r={1.5} />
      <Circle cx={12} cy={12} r={1.5} />
      <Circle cx={18.5} cy={12} r={1.5} />
    </>
  ),
  trash: <Path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />,
  edit: <Path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM15 6.5l3 3" />,
};

/** Icons that are drawn filled rather than stroked look wrong; all are strokes. */
export function Icon({
  name,
  size = 22,
  color = palette.text,
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  color?: string;
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
      strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}

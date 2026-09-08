/**
 * The same line-drawn icon set as the app, as inline SVG.
 *
 * Drawn rather than pulled from a font so the stroke weight matches the app's
 * exactly — on a soft-UI surface a heavier icon reads as a different product.
 */
export type IconName =
  | 'arrowUpRight'
  | 'plus'
  | 'scan'
  | 'home'
  | 'card'
  | 'search'
  | 'settings'
  | 'tune'
  | 'user'
  | 'users'
  | 'ruler'
  | 'layers'
  | 'flow'
  | 'tag'
  | 'image'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'chevronDown'
  | 'back'
  | 'filter'
  | 'box'
  | 'clipboard'
  | 'trend'
  | 'phone'
  | 'pin'
  | 'trash'
  | 'edit';

const PATHS: Record<IconName, React.ReactNode> = {
  arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  card: (
    <>
      <rect x={3} y={6} width={18} height={12} rx={3} />
      <path d="M3 10.5h18" />
    </>
  ),
  search: (
    <>
      <circle cx={11} cy={11} r={6.5} />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  settings: (
    <>
      <circle cx={12} cy={12} r={3.2} />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3.6v-.2a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  tune: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx={16} cy={7} r={2.2} />
      <circle cx={10} cy={17} r={2.2} />
    </>
  ),
  user: (
    <>
      <circle cx={12} cy={8} r={3.6} />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <circle cx={9} cy={8} r={3.3} />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3.3 3.3 0 0 1 0 6.4M17 13.4a6 6 0 0 1 4 5.6" />
    </>
  ),
  ruler: (
    <>
      <rect x={2.5} y={8} width={19} height={8} rx={2} />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />,
  flow: (
    <>
      <rect x={3} y={4} width={7} height={5} rx={1.6} />
      <rect x={14} y={15} width={7} height={5} rx={1.6} />
      <path d="M6.5 9v6a2.5 2.5 0 0 0 2.5 2.5h5" />
    </>
  ),
  tag: (
    <>
      <path d="M3 11.5V4h7.5l9.5 9.5-7.5 7.5z" />
      <circle cx={7.5} cy={7.5} r={1.3} />
    </>
  ),
  image: (
    <>
      <rect x={3} y={4.5} width={18} height={15} rx={2.5} />
      <circle cx={9} cy={10} r={1.7} />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  back: <path d="M19 12H5m6-7-7 7 7 7" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  clipboard: (
    <>
      <rect x={5} y={4.5} width={14} height={16} rx={2.5} />
      <path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  trend: <path d="M3 17.5 9.5 11l4 4L21 7.5M15 7.5h6v6" />,
  phone: (
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" />
  ),
  pin: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
      <circle cx={12} cy={10} r={2.5} />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
};

export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}>
      {PATHS[name]}
    </svg>
  );
}

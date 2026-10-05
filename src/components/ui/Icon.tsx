import type { CSSProperties, SVGProps } from 'react';

const P: Record<string, string> = {
  globe: 'M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25c-2-2.1-3-4.5-3-7.25s1-5.15 3-7.25zM17.25 10a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0z',
  tower: 'M8.2 17.5L8.8 9h2.4l.6 8.5M5.5 9h9l-1.2-3.5H6.7L5.5 9zM10 5.5V3M4.5 17.5h11',
  star: 'M10 2.9l2.1 4.4 4.8.6-3.5 3.3.9 4.8L10 13.7l-4.3 2.3.9-4.8-3.5-3.3 4.8-.6L10 2.9z',
  overhead: 'M17.25 10a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0zM13.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM10 10l4.6-4.6',
  search: 'M14.5 9a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0zM13.2 13.2L17 17',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  bell: 'M10 3.25a4.25 4.25 0 0 0-4.25 4.25v2.6L4.5 13h11l-1.25-2.9V7.5A4.25 4.25 0 0 0 10 3.25zM8.25 15.75a1.75 1.75 0 0 0 3.5 0',
  share: 'M10 12.5V3.5M6.5 7L10 3.5 13.5 7M4.5 11.5v4.25c0 .4.35.75.75.75h9.5c.4 0 .75-.35.75-.75V11.5',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  plus: 'M10 4.5v11M4.5 10h11',
  minus: 'M4.5 10h11',
  locate: 'M13.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3',
  layers: 'M10 3l7 3.8-7 3.8-7-3.8L10 3zM3 10.2l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8',
  sunset: 'M3 14.5h14M5.5 14.5a4.5 4.5 0 0 1 9 0M10 4v2.5M4.2 8.2l1.6 1.4M15.8 8.2l-1.6 1.4M7 17.5h6',
  pin: 'M10 17.5s5.25-4.6 5.25-9a5.25 5.25 0 0 0-10.5 0c0 4.4 5.25 9 5.25 9zM11.9 8.5a1.9 1.9 0 1 1-3.8 0 1.9 1.9 0 0 1 3.8 0z',
  cloud: 'M7.4 6.4a3 3 0 0 1 5.4-1.3M3.6 7.6h-.6M7.6 2.6v.6M5 4.2l-.4-.4M6 15.5h8.25a3 3 0 0 0 .4-5.97A4.25 4.25 0 0 0 6.5 9.3 3.1 3.1 0 0 0 6 15.5z',
  chevronLeft: 'M12.5 4.5L7 10l5.5 5.5',
  chevronRight: 'M7.5 4.5L13 10l-5.5 5.5',
  arrowRight: 'M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5',
  filter: 'M3.5 5h13M6 10h8M8.5 15h3',
  signal: 'M10 17a1.2 1.2 0 1 0 0-.01M6.5 13.5a5 5 0 0 1 7 0M3.8 10.8a8.8 8.8 0 0 1 12.4 0',
  external: 'M8 4.5H5.25a.75.75 0 0 0-.75.75v9.5c0 .4.35.75.75.75h9.5c.4 0 .75-.35.75-.75V12M11 4.5h4.5V9M15.5 4.5L9 11',
  info: 'M10 17.25a7.25 7.25 0 1 0 0-14.5 7.25 7.25 0 0 0 0 14.5zM10 9v4.5M10 6.5v.01',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, strokeWidth = 1.6, fill = 'none', ...rest }: { name: IconName; size?: number; strokeWidth?: number; fill?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="ct-logo" gradientUnits="userSpaceOnUse" x1="3" y1="24" x2="22" y2="7">
          <stop offset="0" stopColor="#fb6c2b" stopOpacity="0" />
          <stop offset="1" stopColor="#fb6c2b" />
        </linearGradient>
      </defs>
      <path d="M3.5 23.5C7 14 13.5 8.6 21.6 7.3" fill="none" stroke="url(#ct-logo)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22.4" cy="7.2" r="3.4" fill="#fb6c2b" />
    </svg>
  );
}

export const PLANE_PATH = 'M0 -10C0.9 -10 1.3 -8.8 1.3 -7.4L1.3 -2.4L9.6 2.4L9.6 4.3L1.3 1.9L1 6.4L3.8 8.4L3.8 9.7L0 8.8L-3.8 9.7L-3.8 8.4L-1 6.4L-1.3 1.9L-9.6 4.3L-9.6 2.4L-1.3 -2.4L-1.3 -7.4C-1.3 -8.8 -0.9 -10 0 -10Z';

export function PlaneGlyph({ size = 22, color = '#fb6c2b', rotate = 0, className, style }: { size?: number; color?: string; rotate?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true" className={className} style={{ overflow: 'visible', transform: `rotate(${rotate}deg)`, ...style }}>
      <path d={PLANE_PATH} fill={color} stroke="#0b1017" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  );
}

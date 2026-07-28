import type { SVGProps } from 'react';

export type IconName =
  | 'assets'
  | 'brand'
  | 'check'
  | 'chevron'
  | 'cloud'
  | 'copy'
  | 'music'
  | 'pause'
  | 'play'
  | 'projects'
  | 'redo'
  | 'replace'
  | 'scissors'
  | 'templates'
  | 'undo';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    assets: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 15 4.5-4.5 4 4 2.5-2.5 7 7" />
        <circle cx="15.5" cy="9" r="1.5" />
      </>
    ),
    brand: (
      <>
        <path d="M12 3a9 9 0 1 0 9 9c0-1.2-.8-2-2-2h-2.2a2 2 0 0 1-2-2V5c0-1.1-.9-2-2-2H12Z" />
        <circle cx="7.5" cy="10" r="1" />
        <circle cx="10" cy="6.5" r="1" />
        <circle cx="7.5" cy="14" r="1" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    cloud: (
      <>
        <path d="M17.5 19H7a4 4 0 0 1-.5-8 6 6 0 0 1 11.3-1.7A4.8 4.8 0 0 1 17.5 19Z" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
        <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    projects: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 4v16M8 9h13M8 15h13" />
      </>
    ),
    redo: (
      <>
        <path d="m17 4 4 4-4 4" />
        <path d="M3 18v-2a8 8 0 0 1 8-8h10" />
      </>
    ),
    replace: (
      <>
        <path d="M20 7h-9a4 4 0 0 0-4 4v1" />
        <path d="m17 4 3 3-3 3M4 17h9a4 4 0 0 0 4-4v-1" />
        <path d="m7 20-3-3 3-3" />
      </>
    ),
    scissors: (
      <>
        <circle cx="6" cy="7" r="3" />
        <circle cx="6" cy="17" r="3" />
        <path d="m8.6 8.5 11.4 7M8.6 15.5 20 8M14 12l2-1.2" />
      </>
    ),
    templates: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    undo: (
      <>
        <path d="m7 4-4 4 4 4" />
        <path d="M21 18v-2a8 8 0 0 0-8-8H3" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

// Small line icons (24x24, stroke = currentColor). Decorative: always next to a text label.
const PATHS: Record<string, string> = {
  chat: "M4 5h16v11H9l-5 4z",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12",
  devices: "M3 6h12v9H3zM7 19h4M18 9h3v10h-3z",
  star: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  memory: "M4 7h16v10H4zM8 7v10M12 7v10M16 7v10M4 20v-3M20 20v-3",
  disk: "M5 4h14v16H5zM8 16h8M12 8a2.5 2.5 0 1 0 0 .1",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  graphics: "M3 7h18v10H3zM7 17v3M17 17v3M8 12a2 2 0 1 0 0 .1M16 12a2 2 0 1 0 0 .1",
  check: "M5 12l4.5 4.5L19 7",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  up: "M12 19V5M6 11l6-6 6 6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.1",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
};

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="icon">
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

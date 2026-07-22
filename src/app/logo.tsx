/**
 * The crossed-quills logo. Inherits currentColor so it follows the theme;
 * the favicon copy (icon.svg) keeps a fixed fill for browser tabs.
 */
export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden fill="currentColor">
      <defs>
        <path id="mt-quill" d="M220 96 Q220 80 236 80 L276 80 Q292 80 292 96 L292 360 L256 444 L220 360 Z" />
        <mask id="mt-back" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="white" />
          <rect x="212" y="114" width="88" height="10" rx="5" fill="black" />
          <rect x="212" y="352" width="88" height="10" rx="5" fill="black" />
          <use href="#mt-quill" transform="rotate(-90 256 256)" fill="black" stroke="black" strokeWidth="22" strokeLinejoin="round" />
        </mask>
        <mask id="mt-front" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="white" />
          <rect x="212" y="114" width="88" height="10" rx="5" fill="black" />
          <rect x="212" y="352" width="88" height="10" rx="5" fill="black" />
        </mask>
      </defs>
      <g>
        <use href="#mt-quill" transform="rotate(45 256 256)" mask="url(#mt-back)" />
        <use href="#mt-quill" transform="rotate(-45 256 256)" mask="url(#mt-front)" />
      </g>
    </svg>
  );
}

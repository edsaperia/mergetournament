/**
 * The crossed-quills logo. Inherits currentColor so it follows the theme;
 * the favicon copy (icon.svg) keeps a fixed fill for browser tabs.
 */
export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden fill="currentColor">
      <defs>
        <path id="mt-quill" d="M230 94 Q230 80 244 80 L268 80 Q282 80 282 94 L282 374 L256 444 L230 374 Z" />
        <mask id="mt-back" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="white" />
          <rect x="222" y="114" width="68" height="9" rx="4.5" fill="black" />
          <rect x="222" y="368" width="68" height="9" rx="4.5" fill="black" />
          <use href="#mt-quill" transform="rotate(-90 256 256)" fill="black" stroke="black" strokeWidth="20" strokeLinejoin="round" />
        </mask>
        <mask id="mt-front" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="white" />
          <rect x="222" y="114" width="68" height="9" rx="4.5" fill="black" />
          <rect x="222" y="368" width="68" height="9" rx="4.5" fill="black" />
        </mask>
      </defs>
      <g>
        <use href="#mt-quill" transform="rotate(45 256 256)" mask="url(#mt-back)" />
        <use href="#mt-quill" transform="rotate(-45 256 256)" mask="url(#mt-front)" />
      </g>
    </svg>
  );
}

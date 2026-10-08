/** Neutral monogram — this system is internal and not the official PRC website or seal. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="PRC Region III eHRIS" className="shrink-0">
      <rect width="40" height="40" rx="9" fill="#153461" />
      <path d="M8 29V11h9.2c3.5 0 5.6 1.9 5.6 4.9 0 3-2.1 4.9-5.6 4.9H12.5V29H8Zm4.5-12.5h4.3c1.2 0 1.9-.6 1.9-1.6s-.7-1.6-1.9-1.6h-4.3v3.2Z" fill="#fff" />
      <rect x="25" y="11" width="7" height="3.2" rx="1.2" fill="#d9b24c" />
      <rect x="25" y="17" width="7" height="3.2" rx="1.2" fill="#87afdd" />
      <rect x="25" y="23" width="7" height="3.2" rx="1.2" fill="#87afdd" />
    </svg>
  );
}

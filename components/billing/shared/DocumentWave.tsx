type Props = {
  className?: string;
};

export function DocumentWave({ className = "" }: Props) {
  return (
    <svg
      className={`document-wave ${className}`.trim()}
      viewBox="0 0 900 1273"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="document-wave-surface"
        d="M900-58V1332H654c54-124-107-221-31-354 92-161-91-262-24-412 64-145-66-251 17-394C683 57 765-14 900-58Z"
      />
      <path
        className="document-wave-fold"
        d="M900 8v1289H758c39-112-91-200-29-319 79-153-73-249-17-392 52-133-47-228 20-356C781 136 828 70 900 8Z"
      />
      <path
        className="document-wave-contour"
        d="M900-58c-135 44-217 115-284 230-83 143 47 249-17 394-67 150 116 251 24 412-76 133 85 230 31 354"
      />
      <path
        className="document-wave-signal"
        d="M900 8c-72 62-119 128-168 222-67 128 32 223-20 356-56 143 96 239 17 392-62 119 68 207 29 319"
      />
      <path
        className="document-wave-registration"
        d="M900 62c-44 59-73 116-102 194-47 124 29 211-15 336-45 128 72 221 15 356-48 113 41 193 19 292"
      />
    </svg>
  );
}

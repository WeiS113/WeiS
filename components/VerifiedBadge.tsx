
type VerifiedBadgeProps = {
  size?: number;
};

export default function VerifiedBadge({
  size = 18,
}: VerifiedBadgeProps) {
  return (
    <span
      title="WeiS 官方认证"
      aria-label="WeiS 官方认证用户"
      className="inline-flex shrink-0 items-center justify-center text-blue-500"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2.5 14.6 4l3-.2 1.4 2.6 2.6 1.4-.2 3L23 13.4l-1.6 2.4.2 3-2.6 1.4-1.4 2.6-3-.2L12 24l-2.6-1.4-3 .2L5 20.2l-2.6-1.4.2-3L1 13.4l1.6-2.6-.2-3L5 6.4l1.4-2.6 3 .2L12 2.5Z" transform="translate(1 -1.2) scale(.92)" />
        <path
          d="m7.5 12.2 3 3 6-6"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}


interface QueueIconProps {
  className?: string;
}

const QueueIcon = ({ className = 'h-5 w-5' }: QueueIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <circle cx="4.5" cy="6.5" r="1.5" />
      <rect x="8.5" y="5.25" width="11.5" height="2.5" rx="1.25" />
      <circle cx="4.5" cy="12" r="1.5" />
      <rect x="8.5" y="10.75" width="11.5" height="2.5" rx="1.25" />
      <circle cx="4.5" cy="17.5" r="1.5" />
      <rect x="8.5" y="16.25" width="11.5" height="2.5" rx="1.25" />
    </svg>
  );
};

export default QueueIcon;

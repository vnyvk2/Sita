interface WindowIconProps {
  className?: string;
}

export const MinimizeIcon = ({ className = 'h-3 w-3' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      fill="currentColor"
      className={className}
    >
      <rect x="1" y="5.5" width="10" height="1" rx="0.5" />
    </svg>
  );
};

export const MaximizeIcon = ({ className = 'h-3 w-3' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      className={className}
    >
      <rect x="1.55" y="1.55" width="8.9" height="8.9" rx="1.2" />
    </svg>
  );
};

export const CloseIcon = ({ className = 'h-3.5 w-3.5' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2.2 2.2L9.8 9.8M9.8 2.2L2.2 9.8" />
    </svg>
  );
};

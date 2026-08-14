interface WindowIconProps {
  className?: string;
}

export const MinimizeIcon = ({ className = 'h-2.5 w-2.5' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="currentColor"
      className={className}
    >
      <rect x="0" y="4.5" width="10" height="1" rx="0.5" />
    </svg>
  );
};

export const MaximizeIcon = ({ className = 'h-2.5 w-2.5' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
    >
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
};

export const CloseIcon = ({ className = 'h-2.5 w-2.5' }: WindowIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      className={className}
    >
      <line x1="0.75" y1="0.75" x2="9.25" y2="9.25" />
      <line x1="9.25" y1="0.75" x2="0.75" y2="9.25" />
    </svg>
  );
};

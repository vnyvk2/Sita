interface LyricsIconProps {
  className?: string;
}

const LyricsIcon = ({ className = 'h-5 w-5' }: LyricsIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3C6.75 3 2.5 6.94 2.5 11.8c0 2.58 1.25 4.9 3.25 6.5-.12 1.08-.58 2.5-1.72 3.55-.17.16-.06.45.17.45 2.1 0 3.98-.8 5.1-1.6.7.13 1.44.2 2.2.2 5.25 0 9.5-3.94 9.5-8.8S17.25 3 12 3zm-2.4 5.4c0.8 0 1.4 0.6 1.4 1.4 0 0.4-0.1 0.7-0.4 1-0.4 0.6-1.1 1.3-2.2 2.6-0.2 0.2-0.5 0.1-0.5-0.2 0.1-0.7 0.4-1.6 0.8-2.4-0.3-0.3-0.5-0.6-0.5-1 0-0.8 0.6-1.4 1.4-1.4zm5.5 0c0.8 0 1.4 0.6 1.4 1.4 0 0.4-0.1 0.7-0.4 1-0.4 0.6-1.1 1.3-2.2 2.6-0.2 0.2-0.5 0.1-0.5-0.2 0.1-0.7 0.4-1.6 0.8-2.4-0.3-0.3-0.5-0.6-0.5-1 0-0.8 0.6-1.4 1.4-1.4z"
      />
    </svg>
  );
};

export default LyricsIcon;

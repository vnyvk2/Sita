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
      <path d="M12 3C6.477 3 2 6.806 2 11.5c0 2.476 1.22 4.7 3.197 6.305-.183.99-.74 2.22-1.782 3.237-.225.22-.078.608.235.608 2.247 0 4.19-.88 5.37-1.637.63.125 1.293.187 1.98.187 5.523 0 10-3.806 10-8.5S17.523 3 12 3zm-3.75 5.5h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5zm0 3.25h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5zm0 3.25h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5z" />
    </svg>
  );
};

export default LyricsIcon;

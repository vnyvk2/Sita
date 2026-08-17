export const getSongCardBackground = (
  palette: NodeVibrantPalette | undefined,
  isDynamicTintEnabled?: boolean
): string => {
  if (!isDynamicTintEnabled) {
    return 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.15) 50%, rgba(0, 0, 0, 0.25) 100%)';
  }

  const defaultColor = '#000000';
  const darkVibrant = palette?.DarkVibrant?.hex ?? defaultColor;
  const vibrant = palette?.Vibrant?.hex ?? defaultColor;
  const darkMuted = palette?.DarkMuted?.hex ?? defaultColor;

  return `linear-gradient(135deg, ${darkVibrant}66, ${vibrant}4D, ${darkMuted}33), linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.25) 100%)`;
};

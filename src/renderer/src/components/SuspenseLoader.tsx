import { useTranslation } from 'react-i18next';

// Direct import (not the fx barrel) keeps unused primitives out of the
// entry chunk — top-level displayName assignments defeat tree-shaking.
import DotLoader from './fx/DotLoader';

const SuspenseLoader = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-background-color-1! text-font-color-highlight dark:bg-dark-background-color-1! dark:text-dark-font-color-highlight flex h-full w-full grow items-center justify-center gap-2 text-center">
      <DotLoader variant="wave" size="md" />
      <span>{t('common.loading')}...</span>
    </div>
  );
};

export default SuspenseLoader;

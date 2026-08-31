import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import Button from '@renderer/components/Button';
import HashTag from '@renderer/components/Biography/HashTag';
import type { Tag } from '../../../../types/last_fm_artist_info_api';

export interface ArtistBioModalProps {
  artistName: string;
  bioParagraphs: string[];
  bioSource?: 'Last.fm' | 'Wikipedia';
  bioUrl?: string;
  tags?: Tag[];
}

export function ArtistBioModal({
  artistName,
  bioParagraphs,
  bioSource = 'Last.fm',
  bioUrl,
  tags = []
}: ArtistBioModalProps) {
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const handleOpenSource = () => {
    if (bioUrl) {
      if (window.api?.utils?.openLink) {
        window.api.utils.openLink(bioUrl);
      } else {
        window.open(bioUrl, '_blank');
      }
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-6 pt-2">
      {/* Modal Header */}
      <div className="flex flex-col space-y-2 border-b border-background-color-2/50 pb-4 dark:border-dark-background-color-2/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-font-color-black dark:text-font-color-white">
              {artistName}
            </h2>
            {bioSource && (
              <span
                className={`flex items-center space-x-1 rounded-full px-3 py-0.5 text-xs font-semibold ${
                  bioSource === 'Wikipedia'
                    ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                    : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                }`}
              >
                <span className="material-icons-round text-xs">
                  {bioSource === 'Wikipedia' ? 'menu_book' : 'public'}
                </span>
                <span>{bioSource}</span>
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-font-color-dimmed dark:text-font-color-white/50">
          {t('biography.aboutArtist', 'Biography & Background Details')}
        </p>
      </div>

      {/* Paragraphs Body (Scrollable, Clean React Text Nodes) */}
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
        {bioParagraphs.length > 0 ? (
          bioParagraphs.map((para, index) => (
            <p
              key={index}
              className="text-sm leading-relaxed text-font-color-black/85 dark:text-font-color-white/85"
            >
              {para}
            </p>
          ))
        ) : (
          <p className="py-8 text-center text-sm italic text-font-color-dimmed dark:text-font-color-white/50">
            {t('biography.noBioFound', 'No detailed biography available for this artist.')}
          </p>
        )}
      </div>

      {/* Tags Section */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-background-color-2/50 pt-4 dark:border-dark-background-color-2/50">
          {tags.map((tag) => (
            <HashTag key={tag.url || tag.name} {...tag} />
          ))}
        </div>
      )}

      {/* Footer Controls */}
      <div className="flex items-center justify-between border-t border-background-color-2/50 pt-4 dark:border-dark-background-color-2/50">
        {bioUrl ? (
          <button
            type="button"
            onClick={handleOpenSource}
            className="flex items-center space-x-1.5 text-xs font-medium text-font-color-highlight hover:underline dark:text-dark-font-color-highlight"
          >
            <span>{t('biography.readFullArticleOnSource', { source: bioSource, defaultValue: `Read on ${bioSource}` })}</span>
            <span className="material-icons-round text-xs">open_in_new</span>
          </button>
        ) : (
          <div />
        )}

        <Button
          label={t('common.close', 'Close')}
          className="rounded-full bg-background-color-2 px-5 py-1.5 text-xs font-medium dark:bg-dark-background-color-2"
          clickHandler={() => changePromptMenuData(false)}
        />
      </div>
    </div>
  );
}

export default ArtistBioModal;

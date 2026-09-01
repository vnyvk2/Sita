import HashTag from '@renderer/components/Biography/HashTag';
import Button from '@renderer/components/Button';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

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
    <div className="flex flex-col space-y-6 pt-2 pb-6">
      {/* Modal Header */}
      <div className="border-background-color-2/50 dark:border-dark-background-color-2/50 flex flex-col space-y-2 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-font-color-black dark:text-font-color-white text-2xl font-bold">
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
        <p className="text-font-color-dimmed dark:text-font-color-white/50 text-xs">
          {t('biography.aboutArtist', 'Biography & Background Details')}
        </p>
      </div>

      {/* Paragraphs Body (Scrollable, Clean React Text Nodes) */}
      <div className="max-h-[55vh] [scrollbar-gutter:stable] space-y-4 overflow-y-auto pr-2">
        {bioParagraphs.length > 0 ? (
          bioParagraphs.map((para, index) => (
            <p
              key={index}
              className="text-font-color-black/85 dark:text-font-color-white/85 text-sm leading-relaxed"
            >
              {para}
            </p>
          ))
        ) : (
          <p className="text-font-color-dimmed dark:text-font-color-white/50 py-8 text-center text-sm italic">
            {t('biography.noBioFound', 'No detailed biography available for this artist.')}
          </p>
        )}
      </div>

      {/* Tags Section */}
      {tags.length > 0 && (
        <div className="border-background-color-2/50 dark:border-dark-background-color-2/50 flex flex-wrap gap-1.5 border-t pt-4">
          {tags.map((tag) => (
            <HashTag key={tag.url || tag.name} {...tag} />
          ))}
        </div>
      )}

      {/* Footer Controls */}
      <div className="border-background-color-2/50 dark:border-dark-background-color-2/50 flex items-center justify-between border-t pt-4">
        {bioUrl ? (
          <button
            type="button"
            onClick={handleOpenSource}
            className="text-font-color-highlight dark:text-dark-font-color-highlight flex items-center space-x-1.5 text-xs font-medium hover:underline"
          >
            <span>
              {t('biography.readFullArticleOnSource', {
                source: bioSource,
                defaultValue: `Read on ${bioSource}`
              })}
            </span>
            <span className="material-icons-round text-xs">open_in_new</span>
          </button>
        ) : (
          <div />
        )}

        <Button
          label={t('common.close', 'Close')}
          className="bg-background-color-2 dark:bg-dark-background-color-2 rounded-full px-5 py-1.5 text-xs font-medium"
          clickHandler={() => changePromptMenuData(false)}
        />
      </div>
    </div>
  );
}

export default ArtistBioModal;

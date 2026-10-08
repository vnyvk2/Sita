import HashTag from '@renderer/components/Biography/HashTag';
import Button from '@renderer/components/Button';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ArtistBiographyEntry } from '../../../../types/artist_discography';
import type { Tag } from '../../../../types/last_fm_artist_info_api';

export interface ArtistBioModalProps {
  artistName: string;
  bioParagraphs: string[];
  bioSource?: 'Last.fm' | 'Wikipedia';
  bioUrl?: string;
  availableBiographies?: ArtistBiographyEntry[];
  initialSource?: 'Last.fm' | 'Wikipedia';
  onSourceChange?: (source: 'Last.fm' | 'Wikipedia') => void;
  tags?: Tag[];
}

export function ArtistBioModal({
  artistName,
  bioParagraphs,
  bioSource = 'Last.fm',
  bioUrl,
  availableBiographies = [],
  initialSource,
  onSourceChange,
  tags = []
}: ArtistBioModalProps) {
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [currentSource, setCurrentSource] = useState<'Last.fm' | 'Wikipedia'>(
    initialSource || bioSource || 'Last.fm'
  );

  const activeEntry = useMemo(() => {
    const matched = availableBiographies.find((b) => b.source === currentSource);
    if (matched) {
      return {
        source: matched.source,
        paragraphs:
          matched.paragraphs && matched.paragraphs.length > 0
            ? matched.paragraphs
            : [matched.summary || matched.fullText || ''],
        url: matched.url
      };
    }
    return {
      source: bioSource,
      paragraphs: bioParagraphs,
      url: bioUrl
    };
  }, [availableBiographies, currentSource, bioSource, bioParagraphs, bioUrl]);

  const handleSelectSource = (src: 'Last.fm' | 'Wikipedia') => {
    setCurrentSource(src);
    onSourceChange?.(src);
  };

  const handleOpenSource = () => {
    const targetUrl = activeEntry.url || bioUrl;
    if (targetUrl) {
      if (window.api?.settingsHelpers?.openInBrowser) {
        window.api.settingsHelpers.openInBrowser(targetUrl);
      } else {
        window.open(targetUrl, '_blank');
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
            {availableBiographies.length <= 1 && activeEntry.source && (
              <span
                className={`flex items-center space-x-1 rounded-full px-3 py-0.5 text-xs font-semibold ${
                  activeEntry.source === 'Wikipedia'
                    ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                    : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                }`}
              >
                <span className="material-icons-round text-xs">
                  {activeEntry.source === 'Wikipedia' ? 'menu_book' : 'public'}
                </span>
                <span>{activeEntry.source}</span>
              </span>
            )}
          </div>

          {/* Multi-source switcher tabs if multiple sources are available */}
          {availableBiographies.length > 1 && (
            <div className="flex items-center gap-1 rounded-xl bg-background-color-1/70 dark:bg-dark-background-color-1/70 p-1 border border-background-color-2/50 dark:border-dark-background-color-2/50">
              {availableBiographies.map((entry) => {
                const isActive = entry.source === currentSource;
                const isWiki = entry.source === 'Wikipedia';
                const paraCount = entry.paragraphs.length;
                return (
                  <button
                    key={entry.source}
                    type="button"
                    onClick={() => handleSelectSource(entry.source)}
                    className={`flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? isWiki
                          ? 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-300 shadow-xs'
                          : 'bg-red-500/20 text-red-600 dark:bg-red-500/30 dark:text-red-300 shadow-xs'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white opacity-70 hover:opacity-100'
                    }`}
                    title={t('biography.selectBioSource', {
                      source: entry.source,
                      defaultValue: `Switch to ${entry.source}`
                    })}
                  >
                    <span className="material-icons-round text-xs">
                      {isWiki ? 'menu_book' : 'public'}
                    </span>
                    <span>{entry.source}</span>
                    {paraCount > 0 && (
                      <span className="text-[10px] opacity-60 font-normal">
                        ({paraCount})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-font-color-dimmed dark:text-font-color-white/50 text-xs">
          {t('biography.aboutArtist', 'Biography & Background Details')}
        </p>
      </div>

      {/* Paragraphs Body (Scrollable, Clean React Text Nodes) */}
      <div className="max-h-[55vh] [scrollbar-gutter:stable] space-y-4 overflow-y-auto pr-2">
        {activeEntry.paragraphs.length > 0 ? (
          activeEntry.paragraphs.map((para, index) => (
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
        {activeEntry.url ? (
          <button
            type="button"
            onClick={handleOpenSource}
            className="text-font-color-highlight dark:text-dark-font-color-highlight flex items-center space-x-1.5 text-xs font-medium hover:underline cursor-pointer"
          >
            <span>
              {t('biography.readFullArticleOnSource', {
                source: activeEntry.source,
                defaultValue: `Read on ${activeEntry.source}`
              })}
            </span>
            <span className="material-icons-round text-xs">open_in_new</span>
          </button>
        ) : (
          <div />
        )}

        <Button
          label={t('common.close', 'Close')}
          className="bg-background-color-2 dark:bg-dark-background-color-2 rounded-full px-5 py-1.5 text-xs font-medium cursor-pointer"
          clickHandler={() => changePromptMenuData(false)}
        />
      </div>
    </div>
  );
}

export default ArtistBioModal;

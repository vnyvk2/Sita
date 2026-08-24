/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useTranslation } from 'react-i18next';

import { parseGenreList } from '@common/genreUtils';
import Button from '../../Button';

type Props = {
  songGenres?: {
    genreId?: number | undefined;
    name: string;
    artworkPath?: string | undefined;
  }[];
  genreResults: { genreId?: number; name: string; artworkPath?: string }[];
  genreKeyword: string;
  updateSongInfo: (_callback: (_prevSongInfo: SongTags) => SongTags) => void;
  updateGenreKeyword: (_keyword: string) => void;
};

const SongGenresInput = (props: Props) => {
  const { t } = useTranslation();
  const { songGenres, genreResults, genreKeyword, updateSongInfo, updateGenreKeyword } = props;

  const commitGenresFromInput = (inputStr: string) => {
    const trimmed = inputStr.trim();
    if (!trimmed) return;

    const parsedTokens = parseGenreList(trimmed);
    if (parsedTokens.length === 0) return;

    updateSongInfo((prevData) => {
      const existingGenres = [...(prevData.genres ?? [])];

      for (const token of parsedTokens) {
        const alreadyExists = existingGenres.some(
          (g) => g.name.toLowerCase() === token.toLowerCase()
        );
        if (alreadyExists) continue;

        const matchedResult = genreResults.find(
          (r) => r.name.toLowerCase() === token.toLowerCase()
        );

        if (matchedResult) {
          existingGenres.push({
            name: matchedResult.name,
            genreId: matchedResult.genreId,
            artworkPath: matchedResult.artworkPath
          });
        } else {
          existingGenres.push({
            name: token,
            genreId: undefined
          });
        }
      }

      return {
        ...prevData,
        genres: existingGenres
      };
    });

    updateGenreKeyword('');
  };

  return (
    <div className="tag-input flex max-w-2xl min-w-40 flex-col">
      <label htmlFor="song-genres-id3-tag">{t('common.genre_other')}</label>
      <div className="border-background-color-2 dark:border-dark-background-color-2 mt-2 w-[90%] rounded-xl border-2 p-2">
        <div className="genres-container flex flex-wrap p-2 empty:py-2 empty:after:h-full empty:after:w-full empty:after:text-center empty:after:text-font-color-dimmed empty:after:content-['No_genres_selected_for_this_song.']">
          {songGenres &&
            songGenres.map((genre) => (
              <span
                key={genre.name}
                className="bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 dark:text-font-color-black mr-2 mb-2 flex w-fit items-center rounded-2xl px-3 py-1 text-center"
              >
                <Button
                  iconName="close"
                  className="material-icons-round mr-1.5! border-0! p-0.5! outline-offset-1 transition-[visibility,opacity] focus-visible:outline!"
                  iconClassName="leading-none dark:text-font-color-black!"
                  clickHandler={() => {
                    updateSongInfo((prevData) => {
                      return {
                        ...prevData,
                        genres: prevData.genres?.filter((x) => x.name !== genre.name) ?? []
                      };
                    });
                  }}
                />
                {genre.name}
              </span>
            ))}
        </div>
        <input
          type="search"
          id="song-genres-id3-tag"
          className="bg-background-color-2 focus:border-font-color-highlight dark:bg-dark-background-color-2 dark:focus:border-dark-font-color-highlight mt-4 w-full rounded-xl border-2 border-transparent p-2 transition-colors"
          placeholder={t('songTagsEditingPage.searchForGenres')}
          value={genreKeyword}
          onChange={(e) => {
            const { value } = e.target;
            if (value.includes(',') || value.includes(';')) {
              commitGenresFromInput(value);
            } else {
              updateGenreKeyword(value);
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitGenresFromInput(genreKeyword);
            }
          }}
        />
        {genreResults.length > 0 && (
          <ol className="genres-results-container border-background-color-2 dark:border-dark-background-color-2 mt-4 max-h-60 overflow-y-auto rounded-xl border-2">
            {genreResults.map((x) => (
              <li
                key={x.genreId ?? x.name}
                className="border-background-color-2 hover:bg-background-color-2 dark:border-dark-background-color-2 dark:hover:bg-dark-background-color-2 box-content cursor-pointer border-b py-2 pr-4 pl-6 font-light last:border-b-0 only:border-b-0"
                onClick={() => {
                  updateSongInfo((prevData) => {
                    const genres = prevData.genres?.filter((genre) => genre.name !== x.name) ?? [];
                    genres?.push({
                      name: x.name,
                      genreId: x.genreId
                    });
                    return {
                      ...prevData,
                      genres
                    };
                  });
                  updateGenreKeyword('');
                }}
              >
                {x.name}
              </li>
            ))}
          </ol>
        )}
        {genreKeyword.trim() && (
          <Button
            label={t('songTagsEditingPage.addNewGenre')}
            className="bg-background-color-2! hover:bg-background-color-3! hover:text-font-color-black dark:bg-dark-background-color-2! dark:hover:bg-dark-background-color-3! dark:hover:text-font-color-black mt-4 w-full!"
            clickHandler={() => {
              commitGenresFromInput(genreKeyword);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SongGenresInput;

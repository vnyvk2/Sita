import { linkArtworksToGenre } from '@main/db/queries/artworks';
import { createGenre, getGenreWithTitle, linkSongToGenre } from '@main/db/queries/genres';
import type { genres } from '@main/db/schema';
import { parseGenreList } from '../../common/genreUtils';

const manageGenresOfParsedSong = async (
  data: { songId: number; artworkId?: number; songGenres: string[] },
  trx: DBTransaction
) => {
  const newGenres: (typeof genres.$inferSelect)[] = [];
  const relevantGenres: (typeof genres.$inferSelect)[] = [];
  const { songId, songGenres, artworkId } = data;

  const normalizedGenres = parseGenreList(songGenres);

  for (const songGenre of normalizedGenres) {
    const songGenreName = songGenre.trim();
    if (!songGenreName) continue;
    const availableGenre = await getGenreWithTitle(songGenreName, trx);

    if (availableGenre) {
      await linkSongToGenre(availableGenre.id, songId, trx);
      relevantGenres.push(availableGenre);
    } else {
      const genre = await createGenre({ name: songGenreName }, trx);

      if (artworkId) {
        await linkArtworksToGenre([{ artworkId, genreId: genre.id }], trx);
      }
      await linkSongToGenre(genre.id, songId, trx);

      relevantGenres.push(genre);
      newGenres.push(genre);
    }
  }
  return { newGenres, relevantGenres };
};

export default manageGenresOfParsedSong;

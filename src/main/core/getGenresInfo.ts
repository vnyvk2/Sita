import { getAllGenres } from '@main/db/queries/genres';

import { convertToGenre } from '../utils/convert';

const getGenresInfo = async (
  genreNamesOrIds: string[] = [],
  sortType?: GenreSortTypes,
  start = 0,
  end = 0
): Promise<PaginatedResult<Genre, GenreSortTypes>> => {
  const numericIds = genreNamesOrIds.map((id) => Number(id)).filter((id) => !isNaN(id));
  const stringNames = genreNamesOrIds.filter((item) => isNaN(Number(item)));

  if (genreNamesOrIds.length > 0 && numericIds.length === 0 && stringNames.length === 0) {
    return {
      data: [],
      total: 0,
      sortType,
      start: 0,
      end: 0
    };
  }

  const genres = await getAllGenres({
    genreIds: numericIds,
    genreNames: stringNames,
    start,
    end,
    sortType
  });

  if (
    genreNamesOrIds.length > 0 &&
    numericIds.length === 0 &&
    stringNames.length > 0 &&
    genres.data.length === 0
  ) {
    return {
      data: [],
      total: 0,
      sortType,
      start: 0,
      end: 0
    };
  }

  const output = genres.data.map((x) => convertToGenre(x));

  return {
    data: output,
    total: genres.data.length,
    sortType,
    start: genres.start,
    end: genres.end
  } satisfies PaginatedResult<Genre, GenreSortTypes>;
};

export default getGenresInfo;

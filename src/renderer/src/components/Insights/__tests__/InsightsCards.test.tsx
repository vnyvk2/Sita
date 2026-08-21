// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  HeroListeningTimeCard,
  TopTracksLeaderboardCard,
  TopArtistsPodiumCard,
  TopGenresCard,
  AudiophileVaultCard,
  CircadianRhythmCard,
  InsightsSkeleton
} from '../index';
import { AppUpdateContext, type AppUpdateContextType } from '../../../contexts/AppUpdateContext';

describe('Insights Bento Cards Component Suite', () => {
  it('HeroListeningTimeCard renders formatted hours, completion rate, and daily bars', () => {
    const summary = {
      totalListeningSeconds: 7320, // 2h 2m
      totalPlaysCount: 45,
      totalSkipsCount: 4,
      completionRate: 0.918,
      uniqueSongsPlayed: 32,
      uniqueArtistsPlayed: 14
    };

    const dailyActivity = [
      { date: '2026-08-19', seconds: 3600, playCount: 20 },
      { date: '2026-08-20', seconds: 3720, playCount: 25 }
    ];

    render(<HeroListeningTimeCard summary={summary} dailyActivity={dailyActivity} />);

    expect(screen.getByText('2h 2m')).toBeDefined();
    expect(screen.getByText('45')).toBeDefined();
    expect(screen.getByText('32')).toBeDefined();
    expect(screen.getByText('92%')).toBeDefined();
    expect(screen.getByText('2 active days')).toBeDefined();
  });

  it('TopTracksLeaderboardCard renders tracks and triggers playSong on click', () => {
    const playSongMock = vi.fn();
    const createQueueMock = vi.fn();

    const mockContext: Partial<AppUpdateContextType> = {
      playSong: playSongMock,
      createQueue: createQueueMock
    };

    const topTracks = [
      {
        songId: 101,
        title: 'Bohemian Rhapsody',
        duration: 354,
        artists: [{ artistId: 1, name: 'Queen' }],
        playCount: 18,
        totalSeconds: 6372
      },
      {
        songId: 102,
        title: 'Starman',
        duration: 256,
        artists: [{ artistId: 2, name: 'David Bowie' }],
        playCount: 12,
        totalSeconds: 3072
      }
    ];

    render(
      <AppUpdateContext.Provider value={mockContext as AppUpdateContextType}>
        <TopTracksLeaderboardCard topTracks={topTracks} />
      </AppUpdateContext.Provider>
    );

    expect(screen.getByText('Bohemian Rhapsody')).toBeDefined();
    expect(screen.getByText('David Bowie')).toBeDefined();
    expect(screen.getByText('5:54')).toBeDefined();
    expect(screen.getByText('4:16')).toBeDefined();

    const trackRow = screen.getByText('Bohemian Rhapsody').closest('div');
    fireEvent.click(trackRow!);

    expect(createQueueMock).toHaveBeenCalledWith(
      [101, 102],
      'songs',
      false,
      undefined,
      true,
      'Top Tracks'
    );
    expect(playSongMock).toHaveBeenCalledWith(101, true);
  });

  it('TopArtistsPodiumCard renders top 3 artists on podium and subsequent rows', () => {
    const topArtists = [
      { artistId: 1, name: 'Pink Floyd', playCount: 50, totalSeconds: 15000 },
      { artistId: 2, name: 'Led Zeppelin', playCount: 35, totalSeconds: 10500 },
      { artistId: 3, name: 'The Beatles', playCount: 28, totalSeconds: 8400 },
      { artistId: 4, name: 'Radiohead', playCount: 15, totalSeconds: 4500 }
    ];

    render(<TopArtistsPodiumCard topArtists={topArtists} />);

    expect(screen.getByText('Pink Floyd')).toBeDefined();
    expect(screen.getByText('Led Zeppelin')).toBeDefined();
    expect(screen.getByText('The Beatles')).toBeDefined();
    expect(screen.getByText('Radiohead')).toBeDefined();
    expect(screen.getByText('👑')).toBeDefined();
  });

  it('TopGenresCard renders multi-colored distribution and genre percentages', () => {
    const topGenres = [
      { genreId: 1, name: 'Progressive Rock', playCount: 40, percentage: 50 },
      { genreId: 2, name: 'Art Rock', playCount: 24, percentage: 30 },
      { genreId: 3, name: 'Psychedelic', playCount: 16, percentage: 20 }
    ];

    render(<TopGenresCard topGenres={topGenres} />);

    expect(screen.getByText('Progressive Rock')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText('Art Rock')).toBeDefined();
    expect(screen.getByText('30%')).toBeDefined();
  });

  it('AudiophileVaultCard displays lossless ratio, average bitrate, and codec pills', () => {
    const stats = {
      totalTracks: 500,
      totalDurationSeconds: 120000,
      averageBitrate: 960,
      losslessCount: 400,
      lossyCount: 100,
      hiResCount: 85,
      codecBreakdown: [
        { codec: 'FLAC', count: 350, percentage: 70 },
        { codec: 'MP3', count: 100, percentage: 20 },
        { codec: 'ALAC', count: 50, percentage: 10 }
      ],
      sampleRateBreakdown: [
        { sampleRate: 96000, count: 85 },
        { sampleRate: 44100, count: 415 }
      ]
    };

    render(<AudiophileVaultCard stats={stats} />);

    expect(screen.getByText('960')).toBeDefined();
    expect(screen.getByText('Lossless (80%)')).toBeDefined();
    expect(screen.getByText('Lossy (20%)')).toBeDefined();
    expect(screen.getByText('Hi-Res: 85')).toBeDefined();
    expect(screen.getByText('FLAC')).toBeDefined();
  });

  it('CircadianRhythmCard renders 24-hour distribution and daypart percentage splits', () => {
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      playCount: hour === 22 ? 15 : 2,
      percentage: hour === 22 ? 25 : 3.2
    }));

    render(<CircadianRhythmCard hourlyDistribution={hourlyDistribution} />);

    expect(screen.getByText('Peak: 10 PM')).toBeDefined();
    expect(screen.getByText('Circadian Rhythm')).toBeDefined();
  });

  it('InsightsSkeleton renders skeleton loader state', () => {
    const { container } = render(<InsightsSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(6);
  });
});

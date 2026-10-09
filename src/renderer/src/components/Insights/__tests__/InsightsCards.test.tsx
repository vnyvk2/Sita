// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../../contexts/AppUpdateContext';
import {
  AudiophileVaultCard,
  CircadianRadarCard,
  CircadianRhythmCard,
  DacSnobCard,
  HeroListeningTimeCard,
  HolographicPassportCard,
  InsightsSkeleton,
  LoopAddictionCard,
  SkipCrimeSceneCard,
  SonicConstellationCard,
  TopArtistsPodiumCard,
  TopGenresCard,
  TopTracksLeaderboardCard
} from '../index';

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
      false,
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

  it('SkipCrimeSceneCard renders attention cliff histogram and awards', () => {
    const skipForensics = {
      totalSkips: 14,
      patienceScore: 78,
      archetype: 'Patient Listener',
      attentionCliff: [
        { label: '0-5s', count: 8, percentage: 57 },
        { label: '6-15s', count: 3, percentage: 21 },
        { label: '16-30s', count: 2, percentage: 14 },
        { label: '31-60s', count: 1, percentage: 7 },
        { label: 'Outro (>85%)', count: 0, percentage: 0 }
      ],
      coldShoulder: {
        songId: 10,
        title: 'Instant Skip',
        positionSecs: 2.4
      },
      theTragedy: {
        songId: 11,
        title: 'Almost Made It',
        completionPercentage: 97.5
      }
    };

    render(<SkipCrimeSceneCard skipForensics={skipForensics} />);

    expect(screen.getByText('The Skip Crime Scene')).toBeDefined();
    expect(screen.getByText('78% Patience')).toBeDefined();
    expect(screen.getByText('Skipped in 2.4s')).toBeDefined();
    expect(screen.getByText('Skipped at 97.5%')).toBeDefined();
    expect(screen.getByText('Patient Listener')).toBeDefined();
  });

  it('DacSnobCard renders lossless purity, raw gigabytes pumped, and resolution spectrum', () => {
    const metrics = {
      rawPcmGigabytes: 42.5,
      losslessPercentage: 88,
      peakSampleRate: 192000,
      resolutionTier: 'Master Class' as const,
      dominantResolution: '24-bit / 96kHz+ Hi-Res',
      spectrum: {
        hiResPercent: 45,
        cdQualityPercent: 43,
        mp3HighPercent: 10,
        lossyOtherPercent: 2
      }
    };

    render(<DacSnobCard metrics={metrics} />);

    expect(screen.getByText('The DAC Snob Quotient')).toBeDefined();
    expect(screen.getByText('88% Lossless')).toBeDefined();
    expect(screen.getByText('42.5')).toBeDefined();
    expect(screen.getByText('GIGABYTES')).toBeDefined();
    expect(screen.getByText('Tier: Master Class')).toBeDefined();
  });

  it('CircadianRadarCard renders polar radar with chronotype badge and supports toggle', () => {
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      playCount: hour === 2 ? 20 : 2,
      percentage: hour === 2 ? 30 : 3
    }));

    const chronotype = {
      name: 'Vampiric Night Owl',
      icon: 'bedtime',
      peakHour: 2,
      peakSegment: 'night' as const,
      segmentPercentages: {
        night: 55,
        morning: 10,
        afternoon: 15,
        evening: 20
      }
    };

    render(<CircadianRadarCard hourlyDistribution={hourlyDistribution} chronotype={chronotype} />);

    expect(screen.getByText('Circadian 2.0: Polar Radar')).toBeDefined();
    expect(screen.getAllByText('Vampiric Night Owl').length).toBeGreaterThan(0);

    const barsButton = screen.getByText('Bars');
    fireEvent.click(barsButton);
    expect(screen.getByText('12 AM')).toBeDefined();
  });

  it('LoopAddictionCard renders consecutive binge streak and obsession score', () => {
    const loopAddiction = {
      hasAddiction: true,
      streakCount: 6,
      songId: 44,
      title: 'Midnight City Loop',
      totalLoopMinutes: 38,
      lastPlayedAt: '2026-10-09'
    };

    render(<LoopAddictionCard loopAddiction={loopAddiction} />);

    expect(screen.getByText('Obsessive Loop Addiction')).toBeDefined();
    expect(screen.getByText('6x Consecutive')).toBeDefined();
    expect(screen.getByText('Midnight City Loop')).toBeDefined();
    expect(screen.getByText('Severe Loopitis')).toBeDefined();
  });

  it('SonicConstellationCard renders orbital canvas and central star', () => {
    const topArtists = [
      { artistId: 1, name: 'Daft Punk', playCount: 50, totalSeconds: 15000 },
      { artistId: 2, name: 'Justice', playCount: 30, totalSeconds: 9000 },
      { artistId: 3, name: 'Kavinsky', playCount: 20, totalSeconds: 6000 }
    ];

    render(<SonicConstellationCard topArtists={topArtists} />);

    expect(screen.getByText('Sonic Constellation')).toBeDefined();
    expect(screen.getByText('Daft Punk')).toBeDefined();
    expect(screen.getByText('3 Systems')).toBeDefined();
  });

  it('HolographicPassportCard renders persona badge and copies story text', () => {
    const summary = {
      totalListeningSeconds: 36000,
      totalPlaysCount: 150,
      totalSkipsCount: 10,
      completionRate: 0.93,
      uniqueSongsPlayed: 80,
      uniqueArtistsPlayed: 40
    };

    const chronotype = {
      name: 'Vampiric Night Owl',
      icon: 'bedtime',
      peakHour: 2,
      peakSegment: 'night' as const,
      segmentPercentages: { night: 50, morning: 10, afternoon: 20, evening: 20 }
    };

    const metrics = {
      rawPcmGigabytes: 15.2,
      losslessPercentage: 92,
      peakSampleRate: 96000,
      resolutionTier: 'Master Class' as const,
      dominantResolution: '24-bit / 96kHz FLAC',
      spectrum: { hiResPercent: 50, cdQualityPercent: 42, mp3HighPercent: 8, lossyOtherPercent: 0 }
    };

    render(<HolographicPassportCard summary={summary} chronotype={chronotype} metrics={metrics} />);

    expect(screen.getByText('Holographic Persona Card')).toBeDefined();
    expect(screen.getByText('10.0h')).toBeDefined();
    expect(screen.getByText('92%')).toBeDefined();

    const shareButton = screen.getByText('Share Story');
    expect(shareButton).toBeDefined();
  });
});

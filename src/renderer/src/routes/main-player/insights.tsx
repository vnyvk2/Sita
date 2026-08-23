import React, { useState, useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import MainContainer from '@renderer/components/MainContainer';
import TitleContainer from '@renderer/components/TitleContainer';
import { queryClient } from '@renderer/queryClient';
import {
  analyticsQuery,
  type HistoryPeriod
} from '@renderer/queries/analytics';
import {
  HeroListeningTimeCard,
  TopTracksLeaderboardCard,
  TopArtistsPodiumCard,
  TopGenresCard,
  AudiophileVaultCard,
  CircadianRhythmCard,
  InsightsSkeleton
} from '@renderer/components/Insights';

export const Route = createFileRoute('/main-player/insights')({
  component: InsightsPage,
  pendingComponent: InsightsSkeleton,
  loader: async () => {
    await queryClient.ensureQueryData(analyticsQuery.listening('30'));
    await queryClient.ensureQueryData(analyticsQuery.libraryStats);
  }
});

const PERIOD_TABS: Array<{ id: HistoryPeriod; label: string }> = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '180', label: '6 Months' },
  { id: '365', label: '1 Year' },
  { id: 'all', label: 'All Time' }
];

export function InsightsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('30');

  const {
    data: listeningData,
    isRefetching: isListeningRefetching,
    refetch: refetchListening
  } = useSuspenseQuery(analyticsQuery.listening(selectedPeriod));

  const {
    data: libraryStats,
    isRefetching: isStatsRefetching,
    refetch: refetchStats
  } = useSuspenseQuery(analyticsQuery.libraryStats);

  const handleRefresh = useCallback(() => {
    refetchListening();
    refetchStats();
  }, [refetchListening, refetchStats]);

  const isRefetching = isListeningRefetching || isStatsRefetching;

  return (
    <MainContainer
      className="insights-container relative flex h-full flex-col overflow-y-auto px-8 pb-12 pt-6"
    >
      {/* Header Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <TitleContainer
            title="Insights & Audio Stats"
            className="text-2xl font-bold tracking-tight text-font-color-black dark:text-font-color-white"
          />
          <p className="mt-1 text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
            Listening trends, format breakdown, and circadian rhythm analysis
          </p>
        </div>

        {/* Controls: Period Tabs + Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector Tabs */}
          <div className="flex items-center rounded-xl border border-background-color-2/70 bg-background-color-1/90 p-1 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90">
            {PERIOD_TABS.map((tab) => {
              const isSelected = selectedPeriod === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedPeriod(tab.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-font-color-highlight text-white shadow-sm dark:bg-dark-font-color-highlight dark:text-dark-background-color-1'
                      : 'text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            title="Refresh Insights"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-background-color-2/70 bg-background-color-1/90 text-font-color-dimmed shadow-sm backdrop-blur-md transition-all hover:text-font-color-black dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90 dark:text-dark-font-color-dimmed dark:hover:text-font-color-white disabled:opacity-50"
          >
            <span className={`material-icons-round text-lg ${isRefetching ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Main Content / Bento Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Row 1: Hero Listening Time (Span 2) + Audiophile Vault (Span 1) */}
        <div className="md:col-span-2">
          <HeroListeningTimeCard
            summary={listeningData.summary}
            dailyActivity={listeningData.dailyActivity}
          />
        </div>
        <div className="col-span-1">
          <AudiophileVaultCard stats={libraryStats} />
        </div>

        {/* Row 2: Top Tracks (Span 1) + Top Artists (Span 1) + Top Genres (Span 1) */}
        <div className="col-span-1 md:col-span-1 xl:col-span-1">
          <TopTracksLeaderboardCard topTracks={listeningData.topTracks} />
        </div>
        <div className="col-span-1 md:col-span-1 xl:col-span-1">
          <TopArtistsPodiumCard topArtists={listeningData.topArtists} />
        </div>
        <div className="col-span-1 md:col-span-1 xl:col-span-1">
          <TopGenresCard topGenres={listeningData.topGenres} />
        </div>

        {/* Row 3: Circadian Rhythm (Span Full / 3) */}
        <div className="col-span-1 md:col-span-2 xl:col-span-3">
          <CircadianRhythmCard
            hourlyDistribution={listeningData.hourlyDistribution}
          />
        </div>
      </div>
    </MainContainer>
  );
}

export default InsightsPage;

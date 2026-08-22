import React, { useState, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import MainContainer from '@renderer/components/MainContainer';
import TitleContainer from '@renderer/components/TitleContainer';
import Button from '@renderer/components/Button';
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
  component: InsightsPage
});

const PERIOD_TABS: Array<{ id: HistoryPeriod; label: string }> = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '180', label: '6 Months' },
  { id: '365', label: '1 Year' },
  { id: 'all', label: 'All Time' }
];

export function InsightsPage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('30');

  const {
    data: listeningData,
    isLoading: isListeningLoading,
    isRefetching: isListeningRefetching,
    refetch: refetchListening
  } = useQuery(analyticsQuery.listening(selectedPeriod));

  const {
    data: libraryStats,
    isLoading: isStatsLoading,
    isRefetching: isStatsRefetching,
    refetch: refetchStats
  } = useQuery(analyticsQuery.libraryStats());

  const handleRefresh = useCallback(() => {
    refetchListening();
    refetchStats();
  }, [refetchListening, refetchStats]);

  const isLoading = isListeningLoading || isStatsLoading;
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
      {isLoading ? (
        <InsightsSkeleton />
      ) : listeningData && libraryStats ? (
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

          {/* Row 2: Top Tracks (Span 1 or 2) + Top Artists (Span 1) + Top Genres (Span 1) */}
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
      ) : (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <span className="material-icons-round text-4xl text-font-color-dimmed dark:text-dark-font-color-dimmed mb-2">
            analytics
          </span>
          <div className="text-sm font-medium text-font-color-black dark:text-font-color-white">
            Failed to load insights data
          </div>
          <Button
            label="Retry"
            className="mt-3 !bg-font-color-highlight !text-white dark:!bg-dark-font-color-highlight dark:!text-dark-background-color-1"
            clickHandler={handleRefresh}
          />
        </div>
      )}
    </MainContainer>
  );
}

export default InsightsPage;

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
} from '@renderer/components/Insights';
import MainContainer from '@renderer/components/MainContainer';
import TitleContainer from '@renderer/components/TitleContainer';
import { analyticsQuery, type HistoryPeriod } from '@renderer/queries/analytics';
import { queryClient } from '@renderer/queryClient';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

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

type ViewMode = 'standard' | 'lab' | 'all';
type StyleMode = 'aurora' | 'vfd' | 'cyberpunk' | 'classic';

export function InsightsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('30');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('nora.insights.viewMode') as ViewMode) || 'standard';
  });
  const [styleMode, setStyleMode] = useState<StyleMode>(() => {
    return (localStorage.getItem('nora.insights.style') as StyleMode) || 'aurora';
  });

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('nora.insights.viewMode', mode);
  };

  const handleStyleChange = (mode: StyleMode) => {
    setStyleMode(mode);
    localStorage.setItem('nora.insights.style', mode);
  };

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
    <MainContainer className="insights-container relative flex h-full flex-col overflow-y-auto px-8 pt-6 pb-16">
      {/* Dynamic Aurora Mesh Background */}
      {styleMode === 'aurora' && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -top-24 -left-24 h-[140%] w-[140%] opacity-20 blur-3xl transition-all duration-1000 dark:opacity-35"
          style={{
            background:
              'radial-gradient(circle at 25% 25%, #06b6d4 0%, transparent 40%), radial-gradient(circle at 75% 35%, #ec4899 0%, transparent 45%), radial-gradient(circle at 50% 80%, #8b5cf6 0%, transparent 45%)'
          }}
        />
      )}

      {/* Cyberpunk Glow Background */}
      {styleMode === 'cyberpunk' && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -top-24 -left-24 h-[140%] w-[140%] opacity-25 blur-3xl transition-all duration-1000 dark:opacity-40"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, #ff007f 0%, transparent 40%), radial-gradient(circle at 80% 80%, #00ffff 0%, transparent 40%)'
          }}
        />
      )}

      {/* Retro VFD Scanline Overlay */}
      {styleMode === 'vfd' && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 opacity-20"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.4) 0px, rgba(0, 0, 0, 0.4) 1px, transparent 1px, transparent 3px)'
          }}
        />
      )}

      {/* Header Bar */}
      <div className="relative z-10 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <TitleContainer
            title="Insights & Audio Stats"
            className="text-font-color-black dark:text-font-color-white text-2xl font-bold tracking-tight"
          />
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 text-xs">
            {viewMode === 'standard'
              ? 'Listening trends, format breakdown, and circadian rhythm analysis'
              : 'Listening trends, circadian chronotypes, DAC audio quality, and skip forensics'}
          </p>
        </div>

        {/* Controls: View Mode Switcher + Style Switcher + Period Tabs + Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle: Standard (Original Simpler) vs Forensics Lab vs All */}
          <div className="border-background-color-2/70 bg-background-color-1/90 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90 flex items-center rounded-xl border p-1 shadow-sm backdrop-blur-md">
            <button
              type="button"
              title="Standard Simple Overview"
              onClick={() => handleViewChange('standard')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === 'standard'
                  ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-sm dark:text-black'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
              }`}
            >
              📊 Standard
            </button>
            <button
              type="button"
              title="Forensics & Lab Cards"
              onClick={() => handleViewChange('lab')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === 'lab'
                  ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-sm dark:text-black'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
              }`}
            >
              🔬 Forensics Lab
            </button>
            <button
              type="button"
              title="Complete Combined Bento"
              onClick={() => handleViewChange('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === 'all'
                  ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-sm dark:text-black'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
              }`}
            >
              🌐 All
            </button>
          </div>

          {/* Aesthetic Style Mode Switcher */}
          <div className="border-background-color-2/70 bg-background-color-1/90 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90 flex items-center rounded-xl border p-1 shadow-sm backdrop-blur-md">
            <button
              type="button"
              title="Aurora Glass Style"
              onClick={() => handleStyleChange('aurora')}
              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                styleMode === 'aurora'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-cyan-500'
              }`}
            >
              🌌 Aurora
            </button>
            <button
              type="button"
              title="Retro Hi-Fi VFD Rack"
              onClick={() => handleStyleChange('vfd')}
              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                styleMode === 'vfd'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-emerald-500'
              }`}
            >
              📼 VFD
            </button>
            <button
              type="button"
              title="Cyber Neon Glow"
              onClick={() => handleStyleChange('cyberpunk')}
              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                styleMode === 'cyberpunk'
                  ? 'bg-fuchsia-500 text-white shadow-sm'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-fuchsia-500'
              }`}
            >
              ⚡ Neon
            </button>
            <button
              type="button"
              title="Clean Classic Style"
              onClick={() => handleStyleChange('classic')}
              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                styleMode === 'classic'
                  ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-sm dark:text-black'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'
              }`}
            >
              Classic
            </button>
          </div>

          {/* Period Selector Tabs */}
          <div className="border-background-color-2/70 bg-background-color-1/90 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90 flex items-center rounded-xl border p-1 shadow-sm backdrop-blur-md">
            {PERIOD_TABS.map((tab) => {
              const isSelected = selectedPeriod === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedPeriod(tab.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight dark:text-dark-background-color-1 text-white shadow-sm'
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
            className="border-background-color-2/70 bg-background-color-1/90 text-font-color-dimmed hover:text-font-color-black dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90 dark:text-dark-font-color-dimmed dark:hover:text-font-color-white flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur-md transition-all disabled:opacity-50"
          >
            <span className={`material-icons-round text-lg ${isRefetching ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* ================= STANDARD VIEW: ORIGINAL CLEAN SIMPLER LAYOUT ================= */}
      {viewMode === 'standard' && (
        <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <div className="col-span-1">
            <TopTracksLeaderboardCard topTracks={listeningData.topTracks} />
          </div>
          <div className="col-span-1">
            <TopArtistsPodiumCard topArtists={listeningData.topArtists} />
          </div>
          <div className="col-span-1">
            <TopGenresCard topGenres={listeningData.topGenres} />
          </div>

          {/* Row 3: Original Clean Circadian Rhythm Bar Chart (Span 3) */}
          <div className="col-span-1 md:col-span-2 xl:col-span-3">
            <CircadianRhythmCard hourlyDistribution={listeningData.hourlyDistribution} />
          </div>
        </div>
      )}

      {/* ================= LAB VIEW: DEDICATED CRAZY FORENSICS CARDS ================= */}
      {viewMode === 'lab' && (
        <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Row 1: Circadian 2.0 Polar Radar (Span 2) + Holographic Passport (Span 1) */}
          <div className="md:col-span-2">
            <CircadianRadarCard
              hourlyDistribution={listeningData.hourlyDistribution}
              chronotype={listeningData.chronotype}
            />
          </div>
          <div className="col-span-1">
            <HolographicPassportCard
              summary={listeningData.summary}
              chronotype={listeningData.chronotype}
              metrics={listeningData.audiophileMetrics}
            />
          </div>

          {/* Row 2: DAC Snob (Span 1) + Skip Crime Scene (Span 1) + Loop Addiction (Span 1) */}
          <div className="col-span-1">
            <DacSnobCard metrics={listeningData.audiophileMetrics} stats={libraryStats} />
          </div>
          <div className="col-span-1">
            <SkipCrimeSceneCard skipForensics={listeningData.skipForensics} />
          </div>
          <div className="col-span-1">
            <LoopAddictionCard loopAddiction={listeningData.loopAddiction} />
          </div>

          {/* Row 3: Sonic Constellation (Span 3) */}
          <div className="col-span-1 md:col-span-2 xl:col-span-3">
            <SonicConstellationCard topArtists={listeningData.topArtists} />
          </div>
        </div>
      )}

      {/* ================= ALL VIEW: COMBINED COMPREHENSIVE BENTO GRID ================= */}
      {viewMode === 'all' && (
        <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Row 1: Hero Listening Time (Span 2) + Holographic Passport (Span 1) */}
          <div className="md:col-span-2">
            <HeroListeningTimeCard
              summary={listeningData.summary}
              dailyActivity={listeningData.dailyActivity}
            />
          </div>
          <div className="col-span-1">
            <HolographicPassportCard
              summary={listeningData.summary}
              chronotype={listeningData.chronotype}
              metrics={listeningData.audiophileMetrics}
            />
          </div>

          {/* Row 2: DAC Snob (Span 1) + Skip Crime Scene (Span 1) + Loop Addiction (Span 1) */}
          <div className="col-span-1">
            <DacSnobCard metrics={listeningData.audiophileMetrics} stats={libraryStats} />
          </div>
          <div className="col-span-1">
            <SkipCrimeSceneCard skipForensics={listeningData.skipForensics} />
          </div>
          <div className="col-span-1">
            <LoopAddictionCard loopAddiction={listeningData.loopAddiction} />
          </div>

          {/* Row 3: Circadian 2.0 Polar Radar (Span 2) + Sonic Constellation (Span 1) */}
          <div className="md:col-span-2">
            <CircadianRadarCard
              hourlyDistribution={listeningData.hourlyDistribution}
              chronotype={listeningData.chronotype}
            />
          </div>
          <div className="col-span-1">
            <SonicConstellationCard topArtists={listeningData.topArtists} />
          </div>

          {/* Row 4: Top Tracks (Span 1) + Top Artists (Span 1) + Top Genres (Span 1) */}
          <div className="col-span-1">
            <TopTracksLeaderboardCard topTracks={listeningData.topTracks} />
          </div>
          <div className="col-span-1">
            <TopArtistsPodiumCard topArtists={listeningData.topArtists} />
          </div>
          <div className="col-span-1">
            <TopGenresCard topGenres={listeningData.topGenres} />
          </div>

          {/* Row 5: Audiophile Vault (Span 3) */}
          <div className="col-span-1 md:col-span-2 xl:col-span-3">
            <AudiophileVaultCard stats={libraryStats} />
          </div>
        </div>
      )}
    </MainContainer>
  );
}

export default InsightsPage;

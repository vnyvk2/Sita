import { memo } from 'react';
import { useTranslation } from 'react-i18next';

export type FullScreenStageMode = 'showcase' | 'vinyl' | 'linerNotes';

interface FullScreenStageSwitcherProps {
  stageMode: FullScreenStageMode;
  onSelectStageMode: (mode: FullScreenStageMode) => void;
  isZenClockEnabled: boolean;
  onToggleZenClock: () => void;
  isVisible: boolean;
}

export const FullScreenStageSwitcher = memo(
  ({
    stageMode,
    onSelectStageMode,
    isZenClockEnabled,
    onToggleZenClock,
    isVisible
  }: FullScreenStageSwitcherProps) => {
    const { t } = useTranslation();

    const stages: Array<{
      id: FullScreenStageMode;
      label: string;
      icon: string;
      shortcut: string;
    }> = [
      {
        id: 'showcase',
        label: t('fullscreen.stageShowcase', 'Showcase'),
        icon: 'photo_album',
        shortcut: '1'
      },
      {
        id: 'vinyl',
        label: t('fullscreen.stageVinyl', 'Vinyl'),
        icon: 'album',
        shortcut: 'V'
      },
      {
        id: 'linerNotes',
        label: t('fullscreen.stageLinerNotes', 'Liner Notes'),
        icon: 'graphic_eq',
        shortcut: 'I'
      }
    ];

    return (
      <div
        data-testid="fullscreen-stage-switcher"
        role="toolbar"
        aria-label={t('fullscreen.stageSwitcher', 'Fullscreen Stage Mode')}
        className={`absolute top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-zinc-950/65 p-1 shadow-2xl backdrop-blur-xl transition-all duration-300 select-none [-webkit-app-region:no-drag] ${
          isVisible
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        {stages.map((stage) => {
          const isActive = stageMode === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              data-testid={`fullscreen-stage-btn-${stage.id}`}
              aria-pressed={isActive}
              onClick={() => onSelectStageMode(stage.id)}
              title={`${stage.label} (${stage.shortcut})`}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 py-1 text-xs font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-white ${
                isActive
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-transparent text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="material-icons-round text-sm">{stage.icon}</span>
              <span>{stage.label}</span>
            </button>
          );
        })}

        <div className="mx-0.5 h-4 w-px bg-white/15" />

        <button
          type="button"
          data-testid="fullscreen-zen-clock-toggle-btn"
          aria-pressed={isZenClockEnabled}
          onClick={onToggleZenClock}
          title={t('fullscreen.toggleZenClock', 'Toggle Zen Clock (C)')}
          aria-label={t('fullscreen.toggleZenClock', 'Toggle Zen Clock')}
          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-white ${
            isZenClockEnabled
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight bg-white/20'
              : 'bg-transparent text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="material-icons-round text-sm">schedule</span>
        </button>
      </div>
    );
  }
);

FullScreenStageSwitcher.displayName = 'FullScreenStageSwitcher';
export default FullScreenStageSwitcher;

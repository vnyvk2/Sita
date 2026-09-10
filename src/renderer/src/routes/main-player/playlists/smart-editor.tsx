import type {
  OrderDefinition,
  RuleCondition,
  RuleGroup,
  SmartPlaylistDefinition
} from '@common/collections/smartPlaylist';
import { CollectionClient } from '@renderer/api/CollectionClient';
import Button from '@renderer/components/Button';
import MainContainer from '@renderer/components/MainContainer';
import { LivePreviewPanel } from '@renderer/components/SmartPlaylist/LivePreviewPanel';
import { RuleGroupBuilder } from '@renderer/components/SmartPlaylist/RuleGroupBuilder';
import { SortLimitControls } from '@renderer/components/SmartPlaylist/SortLimitControls';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useBlocker } from '@tanstack/react-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

// ARCHITECTURAL NOTE ON ROUTE PRECEDENCE:
// In TanStack Router, static segments ('smart-editor') naturally take precedence over
// dynamic path parameters ('$playlistId'). Do not rename this file to a dynamic segment.
export const Route = createFileRoute('/main-player/playlists/smart-editor')({
  validateSearch: z.object({
    playlistId: z.number().int().optional()
  }),
  component: SmartPlaylistEditorPage
});

function isConditionValid(condition: RuleCondition): boolean {
  if (
    condition.operator === 'is_true' ||
    condition.operator === 'is_false' ||
    condition.operator === 'is_null' ||
    condition.operator === 'is_not_null'
  ) {
    return true;
  }
  return condition.value !== undefined && condition.value !== '';
}

function isGroupValid(group: RuleGroup): boolean {
  if (!group.rules || group.rules.length === 0) return false;
  return group.rules.every((rule) => {
    if (rule.type === 'condition') {
      return isConditionValid(rule);
    }
    return isGroupValid(rule);
  });
}

function pruneGroup(group: RuleGroup): RuleGroup {
  const prunedRules = group.rules
    .map((r) => {
      if (r.type === 'group') {
        return pruneGroup(r);
      }
      return r;
    })
    .filter((r) => {
      if (r.type === 'group') {
        return r.rules.length > 0;
      }
      return isConditionValid(r);
    });

  return { ...group, rules: prunedRules };
}

const DEFAULT_DEFINITION: SmartPlaylistDefinition = {
  rule: {
    type: 'group',
    logicalOperator: 'and',
    rules: [
      {
        type: 'condition',
        field: 'title',
        operator: 'contains',
        value: ''
      }
    ]
  },
  orderBy: [{ field: 'addedAt', direction: 'desc' }]
};

function SmartPlaylistEditorPage() {
  const { playlistId } = Route.useSearch();
  const isEditMode = Boolean(playlistId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNewNotifications, changePromptMenuData } = useContext(AppUpdateContext);

  const [name, setName] = useState('');
  const [definition, setDefinition] = useState<SmartPlaylistDefinition>(DEFAULT_DEFINITION);
  const [maxEntries, setMaxEntries] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Mode: Fetch existing playlist and rule data
  const {
    data: existingPlaylist,
    isLoading: isLoadingPlaylist,
    isError: isErrorPlaylist
  } = useQuery({
    queryKey: ['collections', 'detail', playlistId],
    queryFn: () => CollectionClient.getCollection(playlistId!),
    enabled: isEditMode
  });

  const {
    data: existingRule,
    isLoading: isLoadingRule,
    isError: isErrorRule
  } = useQuery({
    queryKey: ['smartPlaylist', 'rule', playlistId],
    queryFn: () => CollectionClient.getSmartRule(playlistId!),
    enabled: isEditMode
  });

  const hasHydratedRef = useRef(false);

  useEffect(() => {
    hasHydratedRef.current = false;
  }, [playlistId]);

  // Edit-Mode Hydration Guard: initialize state once data is loaded
  useEffect(() => {
    if (isEditMode && existingPlaylist && existingRule && !hasHydratedRef.current) {
      setName(existingPlaylist.name);
      setDefinition({
        rule: (existingRule.ruleAst as RuleGroup) || DEFAULT_DEFINITION.rule,
        orderBy: (existingRule.sortDefinition as OrderDefinition[]) || DEFAULT_DEFINITION.orderBy
      });
      setMaxEntries(existingRule.maxEntries ?? null);
      setIsDirty(false);
      hasHydratedRef.current = true;
    }
  }, [isEditMode, existingPlaylist, existingRule]);

  // Unsaved changes navigation blocker
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty && !isSubmitting,
    withResolver: true
  });

  // Prompt confirmation when blocker intercepts navigation
  useEffect(() => {
    if (blocker.status === 'blocked') {
      changePromptMenuData(
        true,
        <>
          <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-8 flex items-center pr-4 text-3xl font-medium">
            Unsaved Changes
          </div>
          <div className="description">
            You have unsaved changes in this smart playlist. Are you sure you want to discard them
            and leave?
          </div>
          <div className="buttons-container mt-8 flex items-center justify-end gap-3">
            <Button
              label="Keep Editing"
              className="cancel-btn hover:border-font-color-highlight"
              clickHandler={() => {
                changePromptMenuData(false);
                blocker.reset?.();
              }}
            />
            <Button
              label="Discard & Leave"
              iconName="logout"
              className="danger-btn bg-font-color-crimson! text-font-color-white"
              clickHandler={() => {
                changePromptMenuData(false);
                blocker.proceed?.();
              }}
            />
          </div>
        </>
      );
    }
  }, [blocker.status, changePromptMenuData, blocker]);

  const isValidRule = useMemo(() => isGroupValid(definition.rule), [definition.rule]);
  const canSave = Boolean(name.trim()) && isValidRule && !isSubmitting;

  const handleRuleChange = useCallback((updatedRule: RuleGroup) => {
    setDefinition((prev) => ({ ...prev, rule: updatedRule }));
    setIsDirty(true);
  }, []);

  const handleOrderByChange = useCallback((updatedOrderBy: OrderDefinition[]) => {
    setDefinition((prev) => ({ ...prev, orderBy: updatedOrderBy }));
    setIsDirty(true);
  }, []);

  const handleMaxEntriesChange = useCallback((updatedMax: number | null) => {
    setMaxEntries(updatedMax);
    setIsDirty(true);
  }, []);

  const handleCancel = () => {
    navigate({ to: '/main-player/playlists' });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSubmitting(true);

    try {
      const cleanDefinition: SmartPlaylistDefinition = {
        rule: pruneGroup(definition.rule),
        orderBy: definition.orderBy
      };

      if (isEditMode && playlistId) {
        await CollectionClient.updateSmartPlaylist({
          playlistId,
          name: name.trim(),
          definition: cleanDefinition,
          maxEntries
        });

        addNewNotifications([
          {
            id: 'smartPlaylistUpdated',
            duration: 4000,
            content: 'Smart playlist updated successfully'
          }
        ]);

        queryClient.invalidateQueries({ queryKey: ['collections'] });
        queryClient.invalidateQueries({ queryKey: ['smartPlaylist', 'rule', playlistId] });
        navigate({
          to: '/main-player/playlists/$playlistId',
          params: { playlistId: playlistId.toString() }
        });
      } else {
        const created = await CollectionClient.createSmartPlaylist({
          name: name.trim(),
          definition: cleanDefinition,
          maxEntries
        });

        addNewNotifications([
          {
            id: 'smartPlaylistCreated',
            duration: 4000,
            content: 'Smart playlist created successfully'
          }
        ]);

        queryClient.invalidateQueries({ queryKey: ['collections'] });
        const targetId = created?.id;
        if (targetId) {
          navigate({
            to: '/main-player/playlists/$playlistId',
            params: { playlistId: targetId.toString() }
          });
        } else {
          navigate({ to: '/main-player/playlists' });
        }
      }
    } catch (error) {
      console.error('Failed to save smart playlist:', error);
      addNewNotifications([
        {
          id: 'smartPlaylistSaveError',
          duration: 5000,
          content: (error as Error).message || 'Failed to save smart playlist'
        }
      ]);
      setIsSubmitting(false);
    }
  };

  // Error Banner State
  if (
    isEditMode &&
    (isErrorPlaylist ||
      isErrorRule ||
      (existingPlaylist && existingPlaylist.playlistType !== 'smart'))
  ) {
    return (
      <MainContainer className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="bg-background-color-1 dark:bg-dark-background-color-1 flex max-w-md flex-col items-center rounded-2xl border border-black/10 p-8 shadow-md dark:border-white/10">
          <span className="material-icons-round text-font-color-crimson text-5xl">warning</span>
          <h2 className="text-font-color-black dark:text-font-color-white mt-4 text-xl font-bold">
            Smart Playlist Not Found
          </h2>
          <p className="text-font-color-black/70 dark:text-font-color-white/70 mt-2 text-sm">
            The requested playlist does not exist or is not a smart playlist.
          </p>
          <Button
            label="Return to Playlists"
            iconName="arrow_back"
            className="bg-font-color-highlight text-font-color-white mt-6 cursor-pointer px-6 py-2"
            clickHandler={() => navigate({ to: '/main-player/playlists' })}
          />
        </div>
      </MainContainer>
    );
  }

  // Hydration Loading State
  if (isEditMode && (isLoadingPlaylist || isLoadingRule)) {
    return (
      <MainContainer className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-icons-round text-font-color-highlight animate-spin text-4xl">
            refresh
          </span>
          <p className="text-font-color-black/60 dark:text-font-color-white/60 text-sm font-medium">
            Loading smart playlist rules...
          </p>
        </div>
      </MainContainer>
    );
  }

  return (
    <MainContainer className="flex h-full flex-col overflow-hidden p-6">
      {/* Header Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black/5 pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            title="Cancel"
            className="text-font-color-black/70 hover:text-font-color-black dark:text-font-color-white/70 dark:hover:text-font-color-white bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors"
          >
            <span className="material-icons-round text-xl">arrow_back</span>
          </button>

          <div>
            <span className="text-font-color-highlight text-xs font-bold tracking-wider uppercase">
              {isEditMode ? 'Edit Smart Playlist' : 'New Smart Playlist'}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Enter playlist name..."
              className="text-font-color-black dark:text-font-color-white block bg-transparent text-2xl font-extrabold outline-hidden"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button
            label="Cancel"
            className="bg-background-color-2 text-font-color-black hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-3 cursor-pointer px-5 py-2.5"
            clickHandler={handleCancel}
          />
          <Button
            label={isSubmitting ? 'Saving...' : isEditMode ? 'Update Playlist' : 'Create Playlist'}
            iconName="check"
            isDisabled={!canSave}
            className={`cursor-pointer px-6 py-2.5 font-bold transition-opacity ${
              canSave
                ? 'bg-font-color-highlight text-font-color-white shadow-md hover:opacity-90'
                : 'cursor-not-allowed bg-black/20 text-black/40 opacity-50 dark:bg-white/20 dark:text-white/40'
            }`}
            clickHandler={handleSave}
          />
        </div>
      </div>

      {/* Main Workspace: Split View */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left / Rule Builder Column */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 lg:col-span-7">
          <RuleGroupBuilder group={definition.rule} onChange={handleRuleChange} depth={1} />
          <SortLimitControls
            orderBy={definition.orderBy}
            onChangeOrderBy={handleOrderByChange}
            maxEntries={maxEntries}
            onChangeMaxEntries={handleMaxEntriesChange}
          />
        </div>

        {/* Right / Live Preview Column */}
        <div className="min-h-0 lg:col-span-5">
          <LivePreviewPanel definition={definition} maxEntries={maxEntries} isValid={isValidRule} />
        </div>
      </div>
    </MainContainer>
  );
}

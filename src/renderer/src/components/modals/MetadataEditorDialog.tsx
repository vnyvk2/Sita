import React, { useState, useEffect } from 'react';

import {
  useMergedMetadata,
  useSetMetadataFields,
  useRemoveMetadataField,
  useClearMetadataOverrides
} from '../../hooks/useMetadata';

export interface MetadataEditorDialogProps {
  isOpen: boolean;
  entityKind: string;
  entityId: string | number;
  onClose: () => void;
}

export const MetadataEditorDialog: React.FC<MetadataEditorDialogProps> = ({
  isOpen,
  entityKind,
  entityId,
  onClose
}) => {
  const { data: mergedData, isLoading } = useMergedMetadata(entityKind, entityId);
  const setFieldsMutation = useSetMetadataFields();
  const removeFieldMutation = useRemoveMetadataField();
  const clearOverridesMutation = useClearMetadataOverrides();

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [tags, setTags] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState('');
  const [composer, setComposer] = useState('');

  useEffect(() => {
    if (mergedData?.fields) {
      setTitle(String(mergedData.fields.title?.value ?? ''));
      setLanguage(String(mergedData.fields.language?.value ?? ''));
      const tagsVal = mergedData.fields.tags?.value;
      setTags(Array.isArray(tagsVal) ? tagsVal.join(', ') : String(tagsVal ?? ''));
      setComment(String(mergedData.fields.comment?.value ?? ''));
      setRating(mergedData.fields.rating?.value != null ? String(mergedData.fields.rating.value) : '');
      setComposer(String(mergedData.fields.composer?.value ?? ''));
    }
  }, [mergedData]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const overrides: Record<string, unknown> = {
      title: title || undefined,
      language: language || undefined,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      comment: comment || undefined,
      rating: rating ? Number(rating) : undefined,
      composer: composer || undefined
    };

    await setFieldsMutation.mutateAsync({
      entityKind,
      entityId,
      overrides
    });
    onClose();
  };

  const handleResetField = async (fieldId: string) => {
    await removeFieldMutation.mutateAsync({
      entityKind,
      entityId,
      fieldId
    });
  };

  const handleClearAll = async () => {
    await clearOverridesMutation.mutateAsync({
      entityKind,
      entityId
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-neutral-900 border border-neutral-800 p-6 text-neutral-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
          <h2 className="text-xl font-bold tracking-wide">Edit Metadata</h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-400 font-mono">
            {entityKind}:{entityId}
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-neutral-400 text-sm">Loading metadata...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 text-sm">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-neutral-400">Title</label>
                <button
                  type="button"
                  onClick={() => handleResetField('title')}
                  className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                >
                  Reset
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-neutral-400">Language</label>
                  <button
                    type="button"
                    onClick={() => handleResetField('language')}
                    className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                  >
                    Reset
                  </button>
                </div>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="e.g. Telugu, English"
                  className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-neutral-400">Rating (1–5)</label>
                  <button
                    type="button"
                    onClick={() => handleResetField('rating')}
                    className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                  >
                    Reset
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-neutral-400">Tags (comma-separated)</label>
                <button
                  type="button"
                  onClick={() => handleResetField('tags')}
                  className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                >
                  Reset
                </button>
              </div>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="rock, favorite, instrumental"
                className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-neutral-400">Composer</label>
                <button
                  type="button"
                  onClick={() => handleResetField('composer')}
                  className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                >
                  Reset
                </button>
              </div>
              <input
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-neutral-400">Comment</label>
                <button
                  type="button"
                  onClick={() => handleResetField('comment')}
                  className="text-[10px] text-neutral-500 hover:text-amber-400 transition"
                >
                  Reset
                </button>
              </div>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded bg-neutral-800 px-3 py-2 text-neutral-200 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-rose-400 hover:text-rose-300 transition"
              >
                Revert All Overrides
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setFieldsMutation.isPending}
                  className="px-4 py-1.5 rounded bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 text-xs transition disabled:opacity-50"
                >
                  {setFieldsMutation.isPending ? 'Saving...' : 'Save Overrides'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

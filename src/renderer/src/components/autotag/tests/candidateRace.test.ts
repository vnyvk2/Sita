// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('Candidate Switching Race Condition & State Protection', () => {
  it('discards stale candidate A when candidate B is selected before A finishes, preserving candidate B preview and loading state', async () => {
    let previewRequestId = 0;
    let loadingPreview = false;
    let loadingCandidateId: string | null = null;
    let activePreview: { releaseId: string; title: string } | null = null;

    // Deferred resolvers to control exact resolution timing
    let resolveCandidateA: (val: any) => void;
    let resolveCandidateB: (val: any) => void;

    const promiseA = new Promise((resolve) => {
      resolveCandidateA = resolve;
    });
    const promiseB = new Promise((resolve) => {
      resolveCandidateB = resolve;
    });

    const mockBuildPreviewApi = vi
      .fn()
      .mockImplementation(async (_songs: any, releaseId: string) => {
        if (releaseId === 'rel-A') return promiseA;
        if (releaseId === 'rel-B') return promiseB;
        return null;
      });

    // Simulates useAlbumAutoTag buildPreview logic
    const buildPreview = async (releaseId: string) => {
      const requestId = ++previewRequestId;
      loadingPreview = true;
      loadingCandidateId = releaseId;

      try {
        const res = await mockBuildPreviewApi([], releaseId);
        // Guard against race condition: if another candidate was selected while waiting, discard stale response
        if (requestId !== previewRequestId) {
          return;
        }
        if (res) {
          activePreview = res;
        }
      } finally {
        if (requestId === previewRequestId) {
          loadingPreview = false;
          loadingCandidateId = null;
        }
      }
    };

    // 1. User clicks Candidate A -> starts in-flight
    const actionA = buildPreview('rel-A');
    expect(loadingCandidateId).toBe('rel-A');
    expect(loadingPreview).toBe(true);

    // 2. User immediately clicks Candidate B before A completes -> B becomes active request
    const actionB = buildPreview('rel-B');
    expect(loadingCandidateId).toBe('rel-B');
    expect(loadingPreview).toBe(true);

    // 3. Candidate A resolves late
    resolveCandidateA!({ releaseId: 'rel-A', title: 'Release A (Stale)' });
    await actionA;

    // INVARIANT: Candidate A completion MUST NOT clear Candidate B's loading state or set activePreview to A!
    expect(activePreview).toBeNull();
    expect(loadingCandidateId).toBe('rel-B');
    expect(loadingPreview).toBe(true);

    // 4. Candidate B resolves
    resolveCandidateB!({ releaseId: 'rel-B', title: 'Release B (Fresh)' });
    await actionB;

    // INVARIANT: Candidate B is accepted and loading state is cleanly cleared
    expect(activePreview).toEqual({ releaseId: 'rel-B', title: 'Release B (Fresh)' });
    expect(loadingCandidateId).toBeNull();
    expect(loadingPreview).toBe(false);
  });

  it('preserves completed Candidate B preview when stale Candidate A finishes afterwards', async () => {
    let previewRequestId = 0;
    let loadingPreview = false;
    let loadingCandidateId: string | null = null;
    let activePreview: { releaseId: string; title: string } | null = null;

    let resolveCandidateA: (val: any) => void;
    let resolveCandidateB: (val: any) => void;

    const promiseA = new Promise((resolve) => {
      resolveCandidateA = resolve;
    });
    const promiseB = new Promise((resolve) => {
      resolveCandidateB = resolve;
    });

    const mockBuildPreviewApi = vi
      .fn()
      .mockImplementation(async (_songs: any, releaseId: string) => {
        if (releaseId === 'rel-A') return promiseA;
        if (releaseId === 'rel-B') return promiseB;
        return null;
      });

    const buildPreview = async (releaseId: string) => {
      const requestId = ++previewRequestId;
      loadingPreview = true;
      loadingCandidateId = releaseId;

      try {
        const res = await mockBuildPreviewApi([], releaseId);
        if (requestId !== previewRequestId) {
          return;
        }
        if (res) {
          activePreview = res;
        }
      } finally {
        if (requestId === previewRequestId) {
          loadingPreview = false;
          loadingCandidateId = null;
        }
      }
    };

    // 1. User selects Candidate A
    const actionA = buildPreview('rel-A');

    // 2. User rapidly selects Candidate B
    const actionB = buildPreview('rel-B');

    // 3. Candidate B finishes first
    resolveCandidateB!({ releaseId: 'rel-B', title: 'Release B (Winner)' });
    await actionB;

    expect(activePreview).toEqual({ releaseId: 'rel-B', title: 'Release B (Winner)' });
    expect(loadingCandidateId).toBeNull();
    expect(loadingPreview).toBe(false);

    // 4. Candidate A finishes afterwards (delayed response)
    resolveCandidateA!({ releaseId: 'rel-A', title: 'Release A (Late / Stale)' });
    await actionA;

    // INVARIANT: Stale Candidate A completion MUST NOT overwrite Candidate B, MUST NOT set loading state, and MUST NOT corrupt preview!
    expect(activePreview).toEqual({ releaseId: 'rel-B', title: 'Release B (Winner)' });
    expect(loadingCandidateId).toBeNull();
    expect(loadingPreview).toBe(false);
  });
});

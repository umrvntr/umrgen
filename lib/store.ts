import { create } from 'zustand';
import type { AppState, PostProcessConfig, ReferenceImage, HistoryItem, ProState, LoraConfig, GenerationState } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// Session ID - persisted in localStorage
let sessionId: string | null = null;

export const getSessionId = (): string => {
  if (typeof window === 'undefined') return 'sid_server';
  if (!sessionId) {
    const saved = localStorage.getItem('umrgen_sid');
    if (saved && saved.startsWith('sid_')) {
      sessionId = saved;
    } else {
      sessionId = `sid_${uuidv4()}`;
      localStorage.setItem('umrgen_sid', sessionId);
    }
  }
  return sessionId;
};

// Load PRO token from localStorage
const loadProState = (): ProState => {
  if (typeof window === 'undefined') {
    return { token: null, plan: 'free', limit: null, remaining: null };
  }
  try {
    const stored = localStorage.getItem('umrgen_pro_token');
    if (stored) {
      const decoded = JSON.parse(atob(stored.split('.')[1]));
      return {
        token: stored,
        plan: decoded.plan || 'free',
        limit: decoded.limit || null,
        remaining: decoded.remaining || null,
      };
    }
  } catch {}
  return { token: null, plan: 'free', limit: null, remaining: null };
};

const INITIAL_GENERATION_STATE: GenerationState = {
  status: 'idle',
  progress: 0,
  image: null,
  preview: null,
  error: null,
  jobId: null,
  queuePosition: null,
  eta: null,
  ipLimitNotice: false,
};

const useStore = create<AppState>((set, get) => ({
  prompt: '',
  negativePrompt: '',
  ratio: '1:1',
  steps: 4,
  ppEnabled: false,
  ppConfig: {
    exposure: 0,
    contrast: 1,
    saturation: 1,
    vibrance: 0,
    sharpness: 0,
    vignette: 0,
    grain_amount: 0,
    grain_size: 0.3,
    temp: 0,
    tint: 0,
    glow_small_intensity: 0,
    glow_small_radius: 0.1,
    glow_small_threshold: 0.25,
    glow_large_intensity: 0,
    glow_large_radius: 50,
    glow_large_threshold: 0.3,
    glare_type: 'star_4',
    glare_intensity: 0,
    glare_length: 1.5,
    glare_angle: 0,
    glare_threshold: 0.95,
    ca_strength: 0,
    radial_blur_type: 'none',
    radial_blur_strength: 0,
    lens_distortion: 0,
  },

  // Generation State
  generation: { ...INITIAL_GENERATION_STATE },

  // Reference Images State
  referenceImages: [],
  uploadingReference: false,

  // History State
  history: [],

  // PRO State
  pro: loadProState(),

  // LoRA State
  loras: [],
  uploadingLora: false,

  // UI State
  isMobile: false,
  sidebarOpen: true,
  historyCollapsed: true,
  proModalOpen: false,

  // System Status
  systemStatus: {
    connected: true,
    queueSize: 0,
    userPosition: null,
    userEta: null,
    activeJobId: null,
    dailyUsed: 0,
    dailyRemaining: 100,
    dailyLimit: 100,
  },

  // Setters - Generation Params
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setRatio: (ratio) => set({ ratio }),
  setSteps: (steps) => set({ steps }),
  setPpEnabled: (ppEnabled) => set({ ppEnabled }),
  setPpConfig: (ppConfig) => set((state) => {
    // Safety clamps for ComfyUI limits
    if (ppConfig.glow_large_radius !== undefined) {
      ppConfig.glow_large_radius = Math.min(Math.max(ppConfig.glow_large_radius, 30), 100);
    }
    if (ppConfig.ca_strength !== undefined) {
      ppConfig.ca_strength = Math.min(Math.max(ppConfig.ca_strength, 0), 0.1);
    }
    if (ppConfig.grain_size !== undefined) {
      ppConfig.grain_size = Math.min(Math.max(ppConfig.grain_size, 0.25), 4.0);
    }
    if (ppConfig.radial_blur_strength !== undefined) {
      ppConfig.radial_blur_strength = Math.min(Math.max(ppConfig.radial_blur_strength, 0), 0.5);
    }
    return { ppConfig: { ...state.ppConfig, ...ppConfig } };
  }),

  // Setters - Generation State
  setGeneration: (generation) =>
    set((state) => ({
      generation: { ...state.generation, ...generation },
    })),

  resetGeneration: () =>
    set({
      generation: { ...INITIAL_GENERATION_STATE },
    }),

  fetchHistory: async () => {
    try {
      const sid = getSessionId();
      const response = await fetch(`/api/history?session_id=${encodeURIComponent(sid)}`);
      if (response.ok) {
        const data = await response.json();
        set({ history: data });
      }
    } catch (e) {
      console.error('[ST] Failed to fetch history:', e);
    }
  },

  fetchSystemStatus: async () => {
    try {
      const sid = getSessionId();
      const response = await fetch(`/api/status?session_id=${encodeURIComponent(sid)}`);
      if (response.ok) {
        const data = await response.json();

        set({
          systemStatus: {
            connected: data.connected,
            queueSize: data.queue_size || 0,
            userPosition: data.user_position ?? null,
            userEta: data.user_eta ?? null,
            activeJobId: data.active_job_id || null,
            dailyUsed: data.daily_used ?? 0,
            dailyRemaining: data.daily_remaining ?? 100,
            dailyLimit: data.daily_limit ?? 100,
          }
        });

        // AUTO-RESUME LOGIC
        const state = get();
        if (data.active_job_id && state.generation.status === 'idle') {
          console.log('[AUTO-RESUME] Found active job:', data.active_job_id);
          startJobLifecycle(data.active_job_id);
        }
      }
    } catch (e) {
      console.error('[ST] Failed to fetch status:', e);
    }
  },

  // Reference Image Actions
  fetchReferenceImages: async () => {
    try {
      const sid = getSessionId();
      const response = await fetch(`/api/references?session_id=${encodeURIComponent(sid)}`);
      if (response.ok) {
        const data: ReferenceImage[] = await response.json();
        set({ referenceImages: data });
      }
    } catch (error) {
      console.error('Failed to fetch reference images:', error);
    }
  },

  uploadReference: async (file: File) => {
    set({ uploadingReference: true });
    try {
      const sid = getSessionId();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sid);

      const response = await fetch('/api/upload/reference', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      const newRef: ReferenceImage = {
        name: data.filename,
        url: data.url,
      };

      set((state) => ({
        referenceImages: [...state.referenceImages, newRef],
      }));
    } catch (error) {
      console.error('Failed to upload reference image:', error);
      throw error;
    } finally {
      set({ uploadingReference: false });
    }
  },

  deleteReference: async (filename: string) => {
    try {
      const sid = getSessionId();
      const response = await fetch(`/api/references/${encodeURIComponent(filename)}?session_id=${encodeURIComponent(sid)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      set((state) => ({
        referenceImages: state.referenceImages.filter((ref) => ref.name !== filename),
      }));
    } catch (error) {
      console.error('Failed to delete reference image:', error);
      throw error;
    }
  },

  // History Actions
  addToHistory: (item: HistoryItem) =>
    set((state) => ({
      history: [item, ...state.history].slice(0, 50), // Keep max 50 items
    })),

  loadFromHistory: (item: HistoryItem) => {
    const updates: Partial<AppState> = {
      prompt: item.prompt,
      negativePrompt: item.negative || '',
      generation: {
        status: 'success',
        progress: 100,
        image: item.imageUrl,
        preview: null,
        error: null,
        jobId: item.id,
        queuePosition: null,
        eta: null,
        ipLimitNotice: false,
      },
    };

    if (item.width && item.height) {
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(item.width, item.height);
      updates.ratio = `${item.width / divisor}:${item.height / divisor}`;
    }

    if (item.steps !== undefined) {
      updates.steps = item.steps;
    }

    if (item.post_processing) {
      updates.ppEnabled = true;
      updates.ppConfig = item.post_processing;
    } else {
      updates.ppEnabled = false;
    }

    updates.referenceImages = [];
    updates.loras = [];

    set(updates);
  },

  // PRO Actions
  activateProKey: async (key: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/activate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.token) {
        localStorage.setItem('umrgen_pro_token', data.token);

        set({
          pro: {
            token: data.token,
            plan: data.plan || 'pro',
            limit: data.limit || null,
            remaining: data.limit || null,
          },
          proModalOpen: false,
        });
        return true;
      } else {
        console.error('[PRO] Activation failed:', data.error);
        return false;
      }
    } catch (error) {
      console.error('[PRO] Activation error:', error);
      return false;
    }
  },

  setProModalOpen: (proModalOpen) => set({ proModalOpen }),

  // LoRA Actions
  addLora: () => {
    const newLora: LoraConfig = {
      id: uuidv4(),
      strength_model: 1.0,
      strength_clip: 1.0,
    };
    set((state) => ({ loras: [...state.loras, newLora] }));
  },

  removeLora: (id: string) => {
    set((state) => ({ loras: state.loras.filter((l) => l.id !== id) }));
  },

  updateLora: (id: string, config: Partial<LoraConfig>) => {
    set((state) => ({
      loras: state.loras.map((l) => (l.id === id ? { ...l, ...config } : l)),
    }));
  },

  uploadLoraFile: async (id: string, file: File) => {
    set({ uploadingLora: true });

    // Initialize progress
    get().updateLora(id, {
      importProgress: { status: 'uploading', bytes: 0, total: file.size }
    });

    try {
      const sid = getSessionId();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sid);

      // Use XMLHttpRequest for upload progress tracking
      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<{ filename: string }>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            get().updateLora(id, {
              importProgress: { status: 'uploading', bytes: event.loaded, total: event.total }
            });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              if (error.error === 'PRO_REQUIRED') {
                get().updateLora(id, {
                  importProgress: { status: 'error', bytes: 0, total: 0, error: 'PRO membership required for LoRA uploads' }
                });
                get().setProModalOpen(true);
                reject(new Error('PRO_REQUIRED'));
                return;
              }
              reject(new Error(error.error || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));

        xhr.open('POST', '/api/upload/lora');

        // Add auth header if PRO
        const proToken = get().pro.token;
        if (proToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${proToken}`);
        }

        xhr.send(formData);
      });

      const data = await uploadPromise;
      get().updateLora(id, { filename: data.filename, importProgress: { status: 'done', bytes: file.size, total: file.size } });
    } catch (error) {
      if (error instanceof Error && error.message !== 'PRO_REQUIRED') {
        console.error('Failed to upload LoRA:', error);
        get().updateLora(id, {
          importProgress: { status: 'error', bytes: 0, total: 0, error: error instanceof Error ? error.message : 'Upload failed' }
        });
      }
    } finally {
      set({ uploadingLora: false });
    }
  },

  importLora: async (id: string, url: string) => {
    if (!url || !url.startsWith('http')) return;
    const sid = getSessionId();

    try {
      // Start import request
      const responsePromise = fetch('/api/loras/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, session_id: sid }),
      });

      // Poll for progress in parallel
      const pollInterval = setInterval(async () => {
        try {
          const progResp = await fetch(`/api/loras/import/progress?session_id=${encodeURIComponent(sid)}`);
          if (!progResp.ok) return;
          const progData = await progResp.json();

          get().updateLora(id, { importProgress: progData });

          if (progData.status === 'done' || progData.status === 'error') {
            clearInterval(pollInterval);
          }
        } catch (e) {
          console.warn('[ST] Progress poll error:', e);
        }
      }, 1000);

      const response = await responsePromise;
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      const data = await response.json();
      get().updateLora(id, { filename: data.filename });
    } catch (error) {
      console.error('LoRA Import failed:', error);
      get().updateLora(id, {
        importProgress: {
          status: 'error',
          bytes: 0,
          total: 0,
          error: error instanceof Error ? error.message : 'Import failed'
        }
      });
    }
  },

  // Setters - UI State
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setHistoryCollapsed: (historyCollapsed) => set({ historyCollapsed }),
  setIsMobile: (isMobile) => set({ isMobile }),

  // Generation Action
  generate: async () => {
    const state = get();
    const { prompt, negativePrompt, ratio, steps, ppEnabled, ppConfig, referenceImages, loras, pro } = state;

    if (!prompt.trim()) {
      set({
        generation: {
          ...state.generation,
          status: 'error',
          error: 'Prompt cannot be empty',
        },
      });
      return;
    }

    set({
      generation: {
        ...INITIAL_GENERATION_STATE,
        status: 'queued',
      },
    });

    const [widthRatio, heightRatio] = ratio.split(':').map(Number);
    const baseSize = 1024;
    const width = widthRatio >= heightRatio ? baseSize : Math.round(baseSize * (widthRatio / heightRatio));
    const height = heightRatio >= widthRatio ? baseSize : Math.round(baseSize * (heightRatio / widthRatio));

    const apiParams = {
      prompt,
      negative: negativePrompt || 'bad quality, blurry',
      width,
      height,
      steps,
      reference_images: referenceImages.map((ref) => ref.name),
      post_processing: ppEnabled ? ppConfig : undefined,
      loras: loras.filter(l => l.url || l.filename).map(l => ({
        url: l.url,
        filename: l.filename,
        strength_model: l.strength_model,
        strength_clip: l.strength_clip
      })),
      session_id: getSessionId(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (pro.token) {
      headers['Authorization'] = `Bearer ${pro.token}`;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(apiParams),
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 429) {
          if (errorData.error === 'CONCURRENT_LIMIT' && errorData.job_id) {
            console.log('[GEN] Concurrency limit hit. Re-attaching to existing job:', errorData.job_id);
            startJobLifecycle(errorData.job_id, false);
            return;
          }
          if (errorData.error === 'DAILY_LIMIT') {
            // Update the counter in system status
            set((s) => ({
              systemStatus: {
                ...s.systemStatus,
                dailyUsed: errorData.daily_used ?? s.systemStatus.dailyUsed,
                dailyRemaining: 0,
                dailyLimit: errorData.daily_limit ?? s.systemStatus.dailyLimit,
              }
            }));
            throw new Error(errorData.message || 'Daily free limit reached. Upgrade to PRO for unlimited.');
          }
        }

        throw new Error(errorData.error || 'Generation failed');
      }

      const data = await response.json();
      const jobId = data.job_id;

      if (data.pro_remaining !== undefined) {
        set((state) => ({
          pro: { ...state.pro, remaining: data.pro_remaining },
        }));
      }

      // Update daily counter from generate response
      if (data.daily_remaining !== undefined) {
        set((s) => ({
          systemStatus: {
            ...s.systemStatus,
            dailyRemaining: data.daily_remaining,
            dailyLimit: data.daily_limit ?? s.systemStatus.dailyLimit,
            dailyUsed: (data.daily_limit ?? s.systemStatus.dailyLimit) - data.daily_remaining,
          }
        }));
      }

      startJobLifecycle(jobId);
    } catch (error) {
      set((s) => ({
        generation: {
          ...s.generation,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      }));
    }
  },
}));

/**
 * INTERNAL HELPERS
 */

function startJobLifecycle(jobId: string, ipNotice = false) {
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const updateGeneration = (patch: Partial<GenerationState>) => {
    useStore.setState((s: AppState) => ({
      generation: { ...s.generation, ...patch },
    }));
  };

  const finalizeWithError = (message: string) => {
    cleanupResources();
    updateGeneration({ status: 'error', error: message, ipLimitNotice: false });
  };

  const finalizeWithSuccess = (imageUrl: string) => {
    cleanupResources();
    updateGeneration({ status: 'success', image: imageUrl, progress: 100, ipLimitNotice: false });
    useStore.getState().addToHistory({
      id: jobId,
      prompt: useStore.getState().prompt,
      imageUrl,
      timestamp: Date.now(),
    });
  };

  // Update state to running
  updateGeneration({
    jobId,
    status: 'running',
    error: null,
    ipLimitNotice: ipNotice,
  });

  const eventSource = new EventSource(`/api/job/${jobId}/stream?session_id=${encodeURIComponent(getSessionId())}`);

  const cleanupResources = () => {
    eventSource.close();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'progress' && data.total > 0) {
        const progress = (data.step / data.total) * 100;
        updateGeneration({ progress });
      }
      if (data.type === 'preview' && data.image) {
        updateGeneration({ preview: `data:image/jpeg;base64,${data.image}` });
      }
      if (data.type === 'error') {
        finalizeWithError(data.message || 'Generation failed');
      }
    } catch (err) {
      console.error('[SSE] Data parse error:', err);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
  };

  pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/job/${jobId}/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      updateGeneration({
        queuePosition: data.queue_position ?? null,
        eta: data.eta_seconds ?? null,
      });

      if (data.state === 'completed') {
        const imageUrl = data.results?.images?.[0]?.url;
        if (imageUrl) {
          finalizeWithSuccess(imageUrl);
        } else {
          finalizeWithError('No image returned');
        }
      } else if (data.state === 'failed') {
        finalizeWithError(data.error || 'Generation failed');
      } else if (data.state === 'unknown') {
        finalizeWithError('Job expired');
      }
    } catch (err) {
      console.warn('[POLL] Error:', err);
    }
  }, 1000);
}

export default useStore;

// Generation Types
export interface PostProcessConfig {
  exposure: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  sharpness: number;
  vignette: number;
  grain_amount: number;
  grain_size: number;
  temp: number;
  tint: number;
  // Glow
  glow_small_intensity: number;
  glow_small_radius: number;
  glow_small_threshold: number;
  glow_large_intensity: number;
  glow_large_radius: number;
  glow_large_threshold: number;
  // Glare
  glare_type: string;
  glare_intensity: number;
  glare_length: number;
  glare_angle: number;
  glare_threshold: number;
  // Others
  ca_strength: number;
  radial_blur_type: string;
  radial_blur_strength: number;
  lens_distortion: number;
}

export interface LoraConfig {
  id: string; // for UI list key
  url?: string;
  filename?: string;
  strength_model: number;
  strength_clip: number;
  importProgress?: {
    status: 'idle' | 'downloading' | 'uploading' | 'done' | 'error';
    bytes: number;
    total: number;
    error?: string;
  };
}

export interface GenerationParams {
  prompt: string;
  negativePrompt: string;
  ratio: string;
  referenceImages: string[];
  pp?: PostProcessConfig;
}

export type GenerationStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';

export interface GenerationState {
  status: GenerationStatus;
  progress: number;
  image: string | null;
  preview: string | null;
  error: string | null;
  jobId: string | null;
  queuePosition: number | null;
  eta: number | null;
  ipLimitNotice: boolean;
}

// Reference Image Types
export interface ReferenceImage {
  name: string;
  url: string;
}

// History Types
export interface HistoryItem {
  id: string;
  job_id?: string;
  prompt: string;
  negative?: string;
  imageUrl: string;
  timestamp: number;
  session_id?: string;
  width?: number;
  height?: number;
  steps?: number;
  post_processing?: PostProcessConfig;
  loras?: LoraConfig[];
  reference_images?: string[];
}

// PRO Types
export type ProPlan = 'free' | 'pro';

export interface ProState {
  token: string | null;
  plan: ProPlan;
  limit: number | null;
  remaining: number | null;
}

// API Response Types
export interface GenerateResponse {
  job_id: string;
  message?: string;
}

export interface JobStatusResponse {
  state: string;
  queue_position?: number | null;
  eta_seconds?: number | null;
  progress?: number;
  image?: string;
  preview?: string;
  error?: string;
}

export interface ProActivationResponse {
  success: boolean;
  token?: string;
  plan?: ProPlan;
  limit?: number;
  error?: string;
}

export interface SystemStatus {
  connected: boolean;
  queueSize: number;
  userPosition: number | null;
  userEta: number | null;
  activeJobId: string | null;
  dailyUsed: number;
  dailyRemaining: number;
  dailyLimit: number;
}

// Store Types
export interface AppState {
  // Generation params
  prompt: string;
  negativePrompt: string;
  ratio: string;
  steps: number;
  ppEnabled: boolean;
  ppConfig: PostProcessConfig;

  // Generation state
  generation: GenerationState;

  // Reference images
  referenceImages: ReferenceImage[];
  uploadingReference: boolean;

  // History
  history: HistoryItem[];

  // PRO state
  pro: ProState;

  // UI state
  isMobile: boolean;
  sidebarOpen: boolean;
  historyCollapsed: boolean;
  proModalOpen: boolean;

  // System status
  systemStatus: SystemStatus;

  // LoRAs
  loras: LoraConfig[];
  uploadingLora: boolean;

  // Actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  setRatio: (ratio: string) => void;
  setSteps: (steps: number) => void;
  setPpEnabled: (enabled: boolean) => void;
  setPpConfig: (config: PostProcessConfig) => void;

  setGeneration: (generation: Partial<GenerationState>) => void;
  resetGeneration: () => void;

  // Reference image actions
  fetchReferenceImages: () => Promise<void>;
  uploadReference: (file: File) => Promise<void>;
  deleteReference: (filename: string) => Promise<void>;
  reorderReferences: (fromIndex: number, toIndex: number) => void;

  // History actions
  addToHistory: (item: HistoryItem) => void;
  loadFromHistory: (item: HistoryItem) => void;
  fetchHistory: () => Promise<void>;

  // PRO actions
  activateProKey: (key: string) => Promise<boolean>;
  setProModalOpen: (open: boolean) => void;

  setSidebarOpen: (open: boolean) => void;
  setHistoryCollapsed: (collapsed: boolean) => void;
  setIsMobile: (mobile: boolean) => void;

  // System actions
  fetchSystemStatus: () => Promise<void>;

  // LoRA actions
  addLora: () => void;
  removeLora: (id: string) => void;
  updateLora: (id: string, config: Partial<LoraConfig>) => void;
  uploadLoraFile: (id: string, file: File) => Promise<void>;
  importLora: (id: string, url: string) => Promise<void>;

  // Generation action
  generate: () => Promise<void>;
}

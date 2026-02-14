'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Menu, X, Upload, Trash2, Zap, Lock, Key, AlertCircle, ChevronLeft, ChevronRight, Sliders, ChevronDown, Plus, Download, Globe, FileUp, History } from 'lucide-react';
import useStore, { getSessionId } from '@/lib/store';
import { LoraConfig } from '@/types';
import HistoryDrawer from '@/components/HistoryDrawer';

export default function HomePage() {
  const {
    prompt,
    negativePrompt,
    ratio,
    steps,
    ppEnabled,
    ppConfig,
    referenceImages,
    uploadingReference,
    generation,
    history,
    pro,
    proModalOpen,
    setPrompt,
    setNegativePrompt,
    setRatio,
    setSteps,
    setPpEnabled,
    setPpConfig,
    generate,
    fetchReferenceImages,
    uploadReference,
    deleteReference,
    loadFromHistory,
    fetchHistory,
    fetchSystemStatus,
    activateProKey,
    setProModalOpen,
    systemStatus,
    resetGeneration,
    loras,
    uploadingLora,
    addLora,
    removeLora,
    updateLora,
    uploadLoraFile,
    importLora,
    isMobile,
    sidebarOpen,
    historyCollapsed,
    setIsMobile,
    setSidebarOpen,
    setHistoryCollapsed,
  } = useStore();

  const [copyToast, setCopyToast] = useState(false);
  const [proKeyInput, setProKeyInput] = useState('');
  const [proActivating, setProActivating] = useState(false);
  const [proError, setProError] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loraFileInputRef = useRef<HTMLInputElement>(null);
  const [activeLoraId, setActiveLoraId] = useState<string | null>(null);

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    pp_color: true,
    pp_glow: false,
    pp_glare: false,
    pp_others: false,
    loras: true,
  });

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isPro = pro.plan === 'pro';
  const isDevUi = (globalThis as any).__DEV_UI__ === 'true';

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile, setSidebarOpen]);

  // Initialization on mount
  useEffect(() => {
    fetchHistory();
    fetchReferenceImages();
    fetchSystemStatus();

    // Regular system status polling
    const pollStatus = setInterval(fetchSystemStatus, 5000);
    return () => clearInterval(pollStatus);
  }, [fetchHistory, fetchReferenceImages, fetchSystemStatus]);

  // Global Paste Handler
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;

          // Optimization: Check reference count before attempting upload
          if (referenceImages.length >= 5) {
            alert('Reference limit reached (max 5).');
            break;
          }

          // Validation (matches handleFileSelect)
          if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
            alert('Only PNG, JPG, and WebP images are allowed.');
            continue;
          }

          if (file.size > 10 * 1024 * 1024) {
            alert('Image must be less than 10MB.');
            continue;
          }

          try {
            await uploadReference(file);
          } catch (error) {
            alert(error instanceof Error ? error.message : 'Paste upload failed');
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [referenceImages.length, uploadReference]);

  // Terminal logs during generation
  useEffect(() => {
    if (generation.status === 'running' || generation.status === 'queued') {
      const logs = [
        'SYSTEM BOOT SEQUENCE INITIATED...',
        'LOADING NEURAL CORES...',
        'FLUX-2-KLEIN-9B ONLINE',
        'INITIALIZING DIFFUSION PIPELINE...',
        `PROMPT HASH: ${prompt.slice(0, 20)}...`,
        'QUANTUM SEED GENERATED',
        'COMMENCING SYNTHESIS...',
      ];
      setTerminalLogs(logs.slice(0, 3));

      const interval = setInterval(() => {
        setTerminalLogs(prev => {
          if (prev.length < logs.length) {
            return [...prev, logs[prev.length]];
          }
          return prev;
        });
      }, 800);

      return () => clearInterval(interval);
    }
  }, [generation.status, prompt]);

  const isGenerating = generation.status === 'running' || generation.status === 'queued';
  const showSystemMonitor = systemStatus.userPosition !== null && generation.status === 'idle';
  const showTerminal = isGenerating || showSystemMonitor;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      alert('Only PNG, JPG, and WebP images are allowed.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB.');
      return;
    }

    try {
      await uploadReference(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Upload failed');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleHistoryClick = (item: typeof history[0]) => {
    loadFromHistory(item);
    handleCopyPrompt(item.prompt);
  };

  const handleProActivate = async () => {
    if (!proKeyInput.trim()) return;
    setProActivating(true);
    setProError('');

    const success = await activateProKey(proKeyInput.trim());

    if (!success) {
      setProError('Invalid license key');
    }
    setProActivating(false);
  };

  // Progress ring calculation
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = generation.progress || 0;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const getTimestamp = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  };

  const numberItemValue = (key: string) => {
    if (key === 'glare_angle' || key === 'glow_large_radius') return 0;
    return 2;
  };

  return (
    <div className="app-container">
      {/* Mobile Toggle */}
      {isMobile && !sidebarOpen && (
        <button className="btn mobile-toggle" onClick={() => setSidebarOpen(true)}>
          <Menu size={16} />
        </button>
      )}

      {/* Mobile Backdrop */}
      {isMobile && sidebarOpen && (
        <div className="backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="header">
          <div className="brand">
            UMRGEN
            <span className="version-badge">v0.9.0</span>
            {isPro && <span className="pro-badge">PRO</span>}
            {isDevUi && <span className="dev-badge">DEV</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isPro && (
              <button
                className="activate-pro-btn"
                onClick={() => setProModalOpen(true)}
              >
                <Key size={10} style={{ marginRight: 4 }} />
                UNLOCK PRO
              </button>
            )}
            <div className={`status-dot ${isGenerating ? 'generating' : ''}`} />
            {isMobile && (
              <button className="btn btn-sm" onClick={() => setSidebarOpen(false)}>
                <X size={14} />
              </button>
            )}
            <button
              className={`btn btn-sm ${!historyCollapsed ? 'active' : ''}`}
              onClick={() => setHistoryCollapsed(!historyCollapsed)}
              title="Toggle History"
            >
              <History size={14} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          {/* Prompt */}
          <div className="section">
            <label className="label">PROMPT</label>
            <textarea
              className="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your image..."
            />
          </div>

          {/* Negative Prompt */}
          <div className="section">
            <label className="label">NEGATIVE</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Unwanted elements..."
            />
          </div>

          {/* Aspect Ratio */}
          <div className="section">
            <label className="label">RATIO</label>
            <div className="ratio-grid">
              {['1:1', '4:3', '3:4', '16:9', '9:16', '4:5', '21:9'].map((r) => (
                <button
                  key={r}
                  className={`ratio-btn ${ratio === r ? 'active' : ''}`}
                  onClick={() => setRatio(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
              <label className="label" style={{ marginBottom: 4 }}>STEPS</label>
              <span style={{
                fontSize: 28,
                color: isPro ? 'var(--accent)' : 'var(--text-dim)',
                fontWeight: 900,
                fontFamily: 'monospace',
                lineHeight: 1,
                textShadow: isPro ? '0 0 10px var(--accent-glow)' : 'none'
              }}>
                {steps.toString().padStart(2, '0')}
              </span>
            </div>
            {isPro ? (
              <input
                type="range"
                min="5"
                max="50"
                value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value))}
                className="steps-slider"
              />
            ) : (
              <div className="steps-locked" onClick={() => setProModalOpen(true)} style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: 9 }}>LOCKED BY FREE VERSION</span>
                <Lock size={10} style={{ color: 'var(--text-dim)' }} />
              </div>
            )}
          </div>

          {/* Post-Processing Suite */}
          <div className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label className="label" style={{ marginBottom: 0 }}>POST-PROCESSING</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {ppEnabled && (
                  <button
                    className="btn btn-sm"
                    onClick={() => setPpConfig({
                      exposure: 0, contrast: 1, saturation: 1, vibrance: 0,
                      sharpness: 0, vignette: 0, grain_amount: 0, grain_size: 0.3,
                      temp: 0, tint: 0,
                      glow_small_intensity: 0, glow_small_radius: 0.1, glow_small_threshold: 0.25,
                      glow_large_intensity: 0, glow_large_radius: 50, glow_large_threshold: 0.3,
                      glare_type: 'star_4', glare_intensity: 0, glare_length: 1.5, glare_angle: 0, glare_threshold: 0.95,
                      ca_strength: 0, radial_blur_type: 'none', radial_blur_strength: 0, lens_distortion: 0
                    })}
                  >
                    RESET
                  </button>
                )}
                <button
                  className={`pp-toggle ${ppEnabled ? 'active' : ''}`}
                  onClick={() => {
                    if (!isPro && !ppEnabled) {
                      setProModalOpen(true);
                      return;
                    }
                    setPpEnabled(!ppEnabled);
                  }}
                >
                  {!isPro && <Lock size={8} style={{ marginRight: 4 }} />}
                  {ppEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {ppEnabled && isPro && (
              <div className="pp-suite">
                {/* Color Adjustments */}
                <div className="accordion">
                  <div className="accordion-header" onClick={() => toggleAccordion('pp_color')}>
                    <span className="accordion-title">COLOR & EXPOSURE</span>
                    <ChevronDown size={14} className={`accordion-icon ${openAccordions.pp_color ? 'open' : ''}`} />
                  </div>
                  {openAccordions.pp_color && (
                    <div className="accordion-content">
                      <div className="pp-group">
                        {[
                          { label: 'EXPOSURE', key: 'exposure', min: -0.5, max: 0.5, step: 0.05 },
                          { label: 'CONTRAST', key: 'contrast', min: 0.5, max: 2, step: 0.1 },
                          { label: 'SATURATION', key: 'saturation', min: 0, max: 2, step: 0.1 },
                          { label: 'VIBRANCE', key: 'vibrance', min: -0.5, max: 0.5, step: 0.05 },
                          { label: 'TEMP', key: 'temp', min: -0.5, max: 0.5, step: 0.05 },
                          { label: 'TINT', key: 'tint', min: -0.5, max: 0.5, step: 0.05 },
                        ].map((item) => (
                          <div key={item.key} className="pp-item">
                            <span className="pp-label">{item.label}</span>
                            <input
                              type="range"
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={ppConfig[item.key as keyof typeof ppConfig]}
                              onChange={(e) => setPpConfig({ ...ppConfig, [item.key]: parseFloat(e.target.value) })}
                              className="pp-slider"
                            />
                            <span className="pp-value">{Number(ppConfig[item.key as keyof typeof ppConfig]).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Glow */}
                <div className="accordion">
                  <div className="accordion-header" onClick={() => toggleAccordion('pp_glow')}>
                    <span className="accordion-title">GLOW (DIFFUSION)</span>
                    <ChevronDown size={14} className={`accordion-icon ${openAccordions.pp_glow ? 'open' : ''}`} />
                  </div>
                  {openAccordions.pp_glow && (
                    <div className="accordion-content">
                      <div className="pp-group">
                        <label className="label" style={{ fontSize: 8, opacity: 0.6 }}>SMALL RADIUS</label>
                        {[
                          { label: 'INTENSITY', key: 'glow_small_intensity', min: 0, max: 1, step: 0.05 },
                          { label: 'RADIUS', key: 'glow_small_radius', min: 0, max: 0.2, step: 0.01 },
                          { label: 'THRESHOLD', key: 'glow_small_threshold', min: 0, max: 1, step: 0.05 },
                        ].map((item) => (
                          <div key={item.key} className="pp-item">
                            <span className="pp-label">{item.label}</span>
                            <input
                              type="range"
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={ppConfig[item.key as keyof typeof ppConfig]}
                              onChange={(e) => setPpConfig({ ...ppConfig, [item.key]: parseFloat(e.target.value) })}
                              className="pp-slider"
                            />
                            <span className="pp-value">{Number(ppConfig[item.key as keyof typeof ppConfig]).toFixed(2)}</span>
                          </div>
                        ))}
                        <label className="label" style={{ fontSize: 8, opacity: 0.6, marginTop: 8 }}>LARGE RADIUS</label>
                        {[
                          { label: 'INTENSITY', key: 'glow_large_intensity', min: 0, max: 1, step: 0.05 },
                          { label: 'RADIUS', key: 'glow_large_radius', min: 30, max: 100, step: 1 },
                          { label: 'THRESHOLD', key: 'glow_large_threshold', min: 0, max: 1, step: 0.05 },
                        ].map((item) => (
                          <div key={item.key} className="pp-item">
                            <span className="pp-label">{item.label}</span>
                            <input
                              type="range"
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={ppConfig[item.key as keyof typeof ppConfig]}
                              onChange={(e) => setPpConfig({ ...ppConfig, [item.key]: parseFloat(e.target.value) })}
                              className="pp-slider"
                            />
                            <span className="pp-value">{Number(ppConfig[item.key as keyof typeof ppConfig]).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Glare */}
                <div className="accordion">
                  <div className="accordion-header" onClick={() => toggleAccordion('pp_glare')}>
                    <span className="accordion-title">GLARE / STARBURST</span>
                    <ChevronDown size={14} className={`accordion-icon ${openAccordions.pp_glare ? 'open' : ''}`} />
                  </div>
                  {openAccordions.pp_glare && (
                    <div className="accordion-content">
                      <div className="pp-group">
                        <div className="pp-item" style={{ gridTemplateColumns: '80px 1fr' }}>
                          <span className="pp-label">TYPE</span>
                          <select
                            value={ppConfig.glare_type}
                            onChange={(e) => setPpConfig({ ...ppConfig, glare_type: e.target.value })}
                            className="btn btn-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)' }}
                          >
                            <option value="star_4">STAR 4</option>
                            <option value="star_6">STAR 6</option>
                            <option value="star_8">STAR 8</option>
                            <option value="anamorphic_h">ANAMORPHIC</option>
                          </select>
                        </div>
                        {[
                          { label: 'INTENSITY', key: 'glare_intensity', min: 0, max: 1, step: 0.05 },
                          { label: 'LENGTH', key: 'glare_length', min: 1, max: 3, step: 0.1 },
                          { label: 'ANGLE', key: 'glare_angle', min: 0, max: 180, step: 15 },
                          { label: 'THRESHOLD', key: 'glare_threshold', min: 0, max: 1, step: 0.05 },
                        ].map((item) => (
                          <div key={item.key} className="pp-item">
                            <span className="pp-label">{item.label}</span>
                            <input
                              type="range"
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={ppConfig[item.key as keyof typeof ppConfig]}
                              onChange={(e) => setPpConfig({ ...ppConfig, [item.key]: parseFloat(e.target.value) })}
                              className="pp-slider"
                            />
                            <span className="pp-value">{Number(ppConfig[item.key as keyof typeof ppConfig]).toFixed(numberItemValue(item.key))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Others */}
                <div className="accordion">
                  <div className="accordion-header" onClick={() => toggleAccordion('pp_others')}>
                    <span className="accordion-title">GRAIN & DISTORTION</span>
                    <ChevronDown size={14} className={`accordion-icon ${openAccordions.pp_others ? 'open' : ''}`} />
                  </div>
                  {openAccordions.pp_others && (
                    <div className="accordion-content">
                      <div className="pp-group">
                        {[
                          { label: 'SHARPNESS', key: 'sharpness', min: 0, max: 1, step: 0.05 },
                          { label: 'VIGNETTE', key: 'vignette', min: 0, max: 1, step: 0.05 },
                          { label: 'GRAIN AMT', key: 'grain_amount', min: 0, max: 1, step: 0.05 },
                          { label: 'GRAIN SIZE', key: 'grain_size', min: 0.25, max: 4, step: 0.1 },
                          { label: 'CHROMA AB', key: 'ca_strength', min: 0, max: 0.1, step: 0.005 },
                          { label: 'LENS DIST', key: 'lens_distortion', min: -0.2, max: 0.2, step: 0.02 },
                        ].map((item) => (
                          <div key={item.key} className="pp-item">
                            <span className="pp-label">{item.label}</span>
                            <input
                              type="range"
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={ppConfig[item.key as keyof typeof ppConfig]}
                              onChange={(e) => setPpConfig({ ...ppConfig, [item.key]: parseFloat(e.target.value) })}
                              className="pp-slider"
                            />
                            <span className="pp-value">{Number(ppConfig[item.key as keyof typeof ppConfig]).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="pp-item" style={{ gridTemplateColumns: '80px 1fr' }}>
                          <span className="pp-label">BLUR TYPE</span>
                          <select
                            value={ppConfig.radial_blur_type}
                            onChange={(e) => setPpConfig({ ...ppConfig, radial_blur_type: e.target.value })}
                            className="btn btn-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)' }}
                          >
                            <option value="none">NONE</option>
                            <option value="spin">SPIN</option>
                            <option value="zoom">ZOOM</option>
                          </select>
                        </div>
                        <div className="pp-item">
                          <span className="pp-label">BLUR STR</span>
                          <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.01"
                            value={ppConfig.radial_blur_strength}
                            onChange={(e) => setPpConfig({ ...ppConfig, radial_blur_strength: parseFloat(e.target.value) })}
                            className="pp-slider"
                          />
                          <span className="pp-value">{ppConfig.radial_blur_strength.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* LoRA Management */}
          <div className="section">
            <div className="accordion">
              <div className="accordion-header" onClick={() => toggleAccordion('loras')}>
                <label className="label" style={{ marginBottom: 0, cursor: 'pointer' }}>LORAS ({loras.length})</label>
                <ChevronDown size={14} className={`accordion-icon ${openAccordions.loras ? 'open' : ''}`} />
              </div>
              {openAccordions.loras && (
                <div className="accordion-content">
                  {!isPro ? (
                    <div className="steps-locked" onClick={() => setProModalOpen(true)} style={{ cursor: 'pointer' }}>
                      <span style={{ fontSize: 9 }}>LOCKED BY FREE VERSION</span>
                      <Lock size={10} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {loras.map((lora) => {
                        const isImporting = lora.importProgress?.status === 'downloading';
                        const isUploading = lora.importProgress?.status === 'uploading';
                        const isTransferring = isImporting || isUploading;
                        const isDone = lora.importProgress?.status === 'done';
                        const isError = lora.importProgress?.status === 'error';
                        const importPct = lora.importProgress?.total ? Math.round((lora.importProgress.bytes / lora.importProgress.total) * 100) : 0;

                        return (
                          <div key={lora.id} className="lora-item">
                            <button className="lora-remove" onClick={() => removeLora(lora.id)}>
                              <Trash2 size={12} />
                            </button>

                            <div className="pp-group">
                              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                  <Globe size={10} style={{ position: 'absolute', left: 8, top: 10, color: 'var(--text-dim)' }} />
                                  <input
                                    type="text"
                                    placeholder="LoRA URL (CivitAI...)"
                                    value={lora.url || ''}
                                    onChange={(e) => updateLora(lora.id, { url: e.target.value })}
                                    style={{ paddingLeft: 24, fontSize: 10 }}
                                  />
                                </div>
                                <button
                                  className={`btn btn-sm ${isImporting ? 'active' : ''}`}
                                  onClick={() => importLora(lora.id, lora.url || '')}
                                  disabled={!lora.url || isImporting}
                                  title="Import from URL"
                                >
                                  {isImporting ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <Download size={14} />}
                                </button>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => {
                                    setActiveLoraId(lora.id);
                                    loraFileInputRef.current?.click();
                                  }}
                                  disabled={uploadingLora}
                                  title="Upload LoRA file"
                                >
                                  {isUploading ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <FileUp size={14} />}
                                </button>
                              </div>

                              {isTransferring && (
                                <div className="lora-progress-container">
                                  <div
                                    className="lora-progress-fill"
                                    style={{ width: `${importPct}%` }}
                                  />
                                  <div style={{ fontSize: 7, color: 'var(--accent)', marginTop: 2, textAlign: 'right' }}>
                                    {isUploading ? 'UPLOADING' : 'DOWNLOADING'} {importPct}%
                                  </div>
                                </div>
                              )}

                              {isError && (
                                <div style={{ fontSize: 8, color: 'var(--danger)', marginBottom: 4 }}>
                                  <AlertCircle size={8} style={{ marginRight: 4 }} />
                                  {lora.importProgress?.error}
                                </div>
                              )}

                              {lora.filename && (
                                <div style={{ fontSize: 9, color: 'var(--success)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {isDone ? <Zap size={8} style={{ marginRight: 4 }} /> : <Download size={8} style={{ marginRight: 4 }} />}
                                  {lora.filename}
                                </div>
                              )}

                              {[
                                { label: 'MODEL STR', key: 'strength_model' },
                                { label: 'CLIP STR', key: 'strength_clip' },
                              ].map((item) => (
                                <div key={item.key} className="pp-item">
                                  <span className="pp-label">{item.label}</span>
                                  <datalist id="lora-ticks">
                                    <option value="-10"></option>
                                    <option value="-5"></option>
                                    <option value="-2"></option>
                                    <option value="-1"></option>
                                    <option value="-0.5"></option>
                                    <option value="0"></option>
                                    <option value="0.5"></option>
                                    <option value="1"></option>
                                    <option value="2"></option>
                                    <option value="5"></option>
                                    <option value="10"></option>
                                  </datalist>
                                  <input
                                    type="range"
                                    min="-10"
                                    max="10"
                                    step="0.1"
                                    list="lora-ticks"
                                    value={(lora as any)[item.key]}
                                    onChange={(e) => {
                                      let val = parseFloat(e.target.value);
                                      const abs = Math.abs(val);
                                      // If outside the "fine" range (1.0), snap to 0.5 increments
                                      if (abs > 1.0) {
                                        val = Math.round(val * 2) / 2;
                                      }
                                      updateLora(lora.id, { [item.key]: val });
                                    }}
                                    className="pp-slider lora-slider"
                                  />
                                  <span className="pp-value">{Number((lora as any)[item.key]).toFixed(1)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      <button className="btn btn-sm btn-primary" onClick={addLora} style={{ width: '100%' }}>
                        <Plus size={14} /> ADD LORA
                      </button>

                      <input
                        ref={loraFileInputRef}
                        type="file"
                        accept=".safetensors,.bin,.pt,.ckpt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && activeLoraId) {
                            uploadLoraFile(activeLoraId, file);
                          }
                          // Reset input value so same file can be selected again if needed
                          if (loraFileInputRef.current) loraFileInputRef.current.value = '';
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reference Images */}
          <div className="section">
            <label className="label">REFERENCES ({referenceImages.length}/5)</label>
            <div className="ref-grid">
              {referenceImages.map((ref) => (
                <div key={ref.name} className="ref-thumb">
                  <img src={ref.url} alt={ref.name} />
                  <button
                    className="delete-btn"
                    onClick={() => deleteReference(ref.name)}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {referenceImages.length < 5 && (
                <button
                  className="ref-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingReference}
                >
                  {uploadingReference ? (
                    <div className="spinner" />
                  ) : (
                    <>
                      <Upload size={14} />
                      <span>ADD</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* PRO Status */}
          {isPro && pro.limit && (
            <div className="section" style={{
              padding: '10px',
              background: 'rgba(255, 215, 0, 0.05)',
              border: '1px solid rgba(255, 215, 0, 0.2)',
              borderRadius: '4px'
            }}>
              <div style={{ fontSize: 10, color: 'var(--pro-gold)', display: 'flex', justifyContent: 'space-between' }}>
                <span>PRO GENERATIONS</span>
                <span>{pro.remaining}/{pro.limit}</span>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <div className="generate-area">
          {/* Daily limit counter for free users */}
          {!isPro && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              padding: '6px 10px',
              background: systemStatus.dailyRemaining <= 10
                ? 'rgba(255, 71, 87, 0.08)'
                : systemStatus.dailyRemaining <= 30
                  ? 'rgba(255, 165, 2, 0.08)'
                  : 'rgba(10, 240, 255, 0.04)',
              border: `1px solid ${systemStatus.dailyRemaining <= 10
                ? 'rgba(255, 71, 87, 0.3)'
                : systemStatus.dailyRemaining <= 30
                  ? 'rgba(255, 165, 2, 0.25)'
                  : 'var(--border-dim)'
                }`,
              borderRadius: 4,
              fontSize: 9,
              letterSpacing: '0.05em',
            }}>
              <span style={{
                color: systemStatus.dailyRemaining <= 10 ? 'var(--danger)' : 'var(--text-dim)',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}>
                DAILY FREE
              </span>
              <span style={{
                color: systemStatus.dailyRemaining <= 10
                  ? 'var(--danger)'
                  : systemStatus.dailyRemaining <= 30
                    ? 'var(--warn)'
                    : 'var(--accent)',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}>
                {systemStatus.dailyRemaining}/{systemStatus.dailyLimit}
              </span>
            </div>
          )}
          <button
            className="btn btn-primary generate-btn"
            onClick={generate}
            disabled={isGenerating || !prompt.trim() || (!isPro && systemStatus.dailyRemaining <= 0)}
          >
            {isGenerating ? (
              <>
                <div className="spinner" />
                <span>SYNTHESIZING...</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>{!isPro && systemStatus.dailyRemaining <= 0 ? 'LIMIT REACHED' : 'GENERATE'}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-area">
        <div className="viewport">
          {/* Idle State with System Monitor Logic */}
          {!showTerminal && generation.status === 'idle' && (
            <div className="viewport-idle">
              <div className="logo">UMRGEN v0.9.0</div>
              <div style={{ fontSize: 10, letterSpacing: '0.2em' }}>SYSTEM READY</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 20, letterSpacing: '0.1em' }} onClick={fetchSystemStatus}>
                POLLING GLOBAL SERVER STATUS...
              </div>
            </div>
          )}

          {/* Loading State / System Monitor - Terminal Overlay */}
          {showTerminal && (
            <div className="terminal-overlay">
              <div className="terminal-header">
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {isGenerating ? 'UMRGEN SYSTEM ENGINE v0.9.0' : 'UMRGEN SYSTEM MONITOR v0.9.0'}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4 }}>
                    {isGenerating
                      ? `SESSION: ${getSessionId().slice(0, 12)}...`
                      : 'YOUR SESSION | OBSERVER MODE'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>YOUR POSITION</div>
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {isGenerating
                      ? `#${(generation.queuePosition ?? 0) + 1}`
                      : (systemStatus.userPosition !== null ? `#${systemStatus.userPosition + 1}` : 'IDLE')}
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>YOUR ETA</div>
                  <div style={{ fontWeight: 700, color: 'var(--warn)' }}>
                    {isGenerating
                      ? (generation.eta ? `${generation.eta}s` : '--')
                      : (systemStatus.userEta ? `${systemStatus.userEta}s` : '--')}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    {isGenerating
                      ? (generation.status === 'queued' ? 'WAITING' : 'PROCESSING')
                      : (systemStatus.userPosition !== null ? 'QUEUED' : 'IDLE')}
                  </div>
                  {isGenerating && (
                    <div style={{ color: 'var(--success)', fontSize: 10, marginTop: 4 }}>
                      PROGRESS: {progress.toFixed(0)}%
                    </div>
                  )}
                </div>

              </div>

              {/* IP Alert Notice */}
              {generation.ipLimitNotice && (
                <div style={{
                  margin: '16px 20px',
                  padding: '12px',
                  background: 'rgba(255, 170, 0, 0.1)',
                  border: '1px solid var(--warn)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  animation: 'pulse-glow 2s infinite'
                }}>
                  <AlertCircle size={20} color="var(--warn)" />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--warn)', fontSize: 11, letterSpacing: '0.05em' }}>CONCURRENCY LIMIT: IP ADDRESS</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      ANOTHER SESSION FROM THIS IP IS ACTIVE. RE-ATTACHED TO GLOBAL QUEUE.
                    </div>
                  </div>
                </div>
              )}

              {/* SYSTEM MONITOR LOGS for idle users */}
              {!isGenerating && systemStatus.userPosition !== null && (
                <div style={{ margin: '16px 20px', padding: '16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
                    <Zap size={14} className="pulse" />
                    YOU ARE IN QUEUE: POSITION #{systemStatus.userPosition + 1}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
                    The server is processing {systemStatus.queueSize} total jobs. Your estimated wait time is {systemStatus.userEta} seconds. Your terminal will show progress when your generation starts.
                  </div>
                </div>
              )}

              <div className="terminal-logs">
                {isGenerating ? terminalLogs.map((log, i) => (
                  <div key={i} className="log-line" style={{ animationDelay: `${i * 0.1}s` }}>
                    <span className="log-time">{getTimestamp()}</span>
                    <span style={{ color: i === terminalLogs.length - 1 ? 'var(--accent)' : 'var(--text)' }}>
                      {log}
                    </span>
                  </div>
                )) : (
                  <div className="log-line">
                    <span className="log-time">{getTimestamp()}</span>
                    <span style={{ color: 'var(--text-dim)' }}>LISTENING FOR GLOBAL JOB COMPLETIONS...</span>
                  </div>
                )}
              </div>

              {/* Live Preview Section */}
              {isGenerating && generation.preview && (
                <div className="step-preview-zone">
                  <div className="preview-header">
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>LIVE SYNTHESIS FEED</span>
                    <span style={{ color: 'var(--success)' }}>STEP {Math.min(steps, Math.ceil((progress / 100) * steps) || 1)}/{steps}</span>
                  </div>
                  <div className="preview-viewport">
                    <img src={generation.preview} alt="Preview" className="step-image" />
                    <div className="preview-overlay">
                      <div className="scan-line" />
                      <div className="preview-grid" />
                    </div>
                  </div>
                </div>
              )}

              {/* Technical Synthesis Progress Bar (only for active users) */}
              {isGenerating && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  margin: isMobile ? '15px 0' : '30px 0',
                  padding: isMobile ? '12px' : '20px',
                  background: 'rgba(10, 240, 255, 0.03)',
                  border: '1px solid var(--accent-dim)',
                  fontFamily: 'var(--font)',
                  position: 'relative',
                  zIndex: 2,
                  overflow: 'hidden'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '0.1em' }}>
                    <span style={{ color: 'var(--text-dim)' }}>SYNTHESIS PROGRESS</span>
                    <span style={{ color: 'var(--accent)' }}>{progress.toFixed(1)}%</span>
                  </div>

                  <div style={{ fontFamily: 'monospace', fontSize: isMobile ? 12 : 14, letterSpacing: '0px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text-dim)' }}>[</span>
                    <span style={{ color: 'var(--accent)' }}>
                      {'█'.repeat(Math.floor(progress / (100 / (isMobile ? 20 : 40))))}
                    </span>
                    <span style={{ color: 'var(--border)' }}>
                      {'░'.repeat(Math.max(0, (isMobile ? 20 : 40) - Math.floor(progress / (100 / (isMobile ? 20 : 40)))))}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>]</span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 16,
                    fontSize: 9,
                    marginTop: 8,
                    borderTop: '1px solid var(--border-dim)',
                    paddingTop: 12
                  }}>
                    <div>
                      <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>STEP</div>
                      <div style={{ color: 'var(--success)', fontWeight: 700 }}>
                        {Math.min(steps, Math.ceil((progress / 100) * steps) || 1).toString().padStart(2, '0')} / {steps.toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>LATENT</div>
                      <div style={{ color: 'var(--warn)', fontWeight: 700 }}>1024×1024</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>SAMPLER</div>
                      <div style={{ color: 'var(--accent)', fontWeight: 700 }}>EULER</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="terminal-status">
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>STATUS:</span>
                  <span style={{ marginLeft: 8, color: 'var(--accent)' }}>
                    {isGenerating
                      ? (generation.status === 'queued'
                        ? 'WAITING IN QUEUE...'
                        : (progress >= 100 ? 'FINALIZING RESULT...' : 'NEURAL SYNTHESIS ACTIVE'))
                      : 'SYSTEM MONITORING: BUSY'}
                  </span>
                </div>
                <button className="terminal-abort" onClick={resetGeneration}>
                  ABORT SYNTHESIS
                </button>
              </div>
            </div>
          )}

          {/* Result Image */}
          {generation.status === 'success' && generation.image && (
            <img src={generation.image} alt="Result" className="viewport-image" />
          )}

          {/* Error State */}
          {generation.status === 'error' && (
            <div className="error-state">
              <AlertCircle size={40} />
              <div style={{ fontWeight: 700 }}>SYNTHESIS FAILED</div>
              <div className="message">{generation.error || 'Unknown engine error'}</div>
              <button className="btn btn-sm" onClick={resetGeneration} style={{ marginTop: 10 }}>
                RETRY
              </button>
            </div>
          )}
        </div>

        {/* History Drawer */}
        <HistoryDrawer history={history} onHistoryClick={handleHistoryClick} />
      </div>

      {/* Copy Toast */}
      {copyToast && (
        <div className="copy-toast">
          PROMPT COPIED TO CLIPBOARD
        </div>
      )}

      {/* PRO Modal */}
      {proModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">UPGRADE TO PRO</div>
            <p className="modal-desc">
              Unlock maximum performance with up to 50 steps, advanced post-processing, LoRA support, and direct GPU access.
            </p>

            <input
              type="text"
              className="pro-key-input"
              placeholder="ENTER LICENSE KEY"
              value={proKeyInput}
              onChange={(e) => setProKeyInput(e.target.value.toUpperCase())}
            />

            {proError && (
              <div style={{ color: 'var(--danger)', fontSize: 10, marginBottom: 16 }}>
                {proError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setProModalOpen(false)}
              >
                CANCEL
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleProActivate}
                disabled={proActivating || !proKeyInput}
              >
                {proActivating ? <div className="spinner" /> : 'ACTIVATE'}
              </button>
            </div>

            <div style={{ marginTop: 24, fontSize: 9, color: 'var(--text-dim)' }}>
              DON'T HAVE A KEY? <a href="#" style={{ color: 'var(--pro-gold)', fontWeight: 700 }}>GET ONE HERE</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

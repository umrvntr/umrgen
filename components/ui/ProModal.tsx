import React, { useState } from 'react';
import useStore from '@/lib/store';

export function ProModal() {
  const { proModalOpen, setProModalOpen, activateProKey } = useStore();
  const [proKeyInput, setProKeyInput] = useState('');
  const [proActivating, setProActivating] = useState(false);
  const [proError, setProError] = useState('');

  if (!proModalOpen) return null;

  const handleActivate = async () => {
    if (!proKeyInput.trim()) return;
    setProActivating(true);
    setProError('');
    
    const success = await activateProKey(proKeyInput.trim());
    
    if (!success) {
      setProError('Invalid license key');
    }
    setProActivating(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">UPGRADE TO PRO</div>
        <p className="modal-desc">
          Unlock maximum performance with up to 13 steps, advanced post-processing, LoRA support, and direct GPU access.
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
            onClick={handleActivate}
            disabled={proActivating || !proKeyInput}
          >
            {proActivating ? <div className="spinner" /> : 'ACTIVATE'}
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: 9, color: 'var(--text-dim)' }}>
          GET YOUR KEY IN{' '}
          <a 
            href="https://t.me/+mL7RadPbI9VlYjYy" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: 'var(--pro-gold)', fontWeight: 700 }}
          >
            @umrlab
          </a>
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Zap, Clock, MessageSquare, X } from 'lucide-react';
import useStore from '@/lib/store';
import { HistoryItem } from '@/types';

interface HistoryDrawerProps {
  history: HistoryItem[];
  onHistoryClick: (item: HistoryItem) => void;
}

export default function HistoryDrawer({ history, onHistoryClick }: HistoryDrawerProps) {
  const { historyCollapsed: isCollapsed, setHistoryCollapsed: setIsCollapsed, generation } = useStore();
  const historyRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const scrollHistory = (direction: 'up' | 'down') => {
    if (historyRef.current) {
      const scrollAmount = direction === 'up' ? -300 : 300;
      historyRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
  };

  // Scroll to top on new content
  useEffect(() => {
    if (historyRef.current && history.length > 0 && !isCollapsed) {
      historyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [history.length, isCollapsed]);

  return (
    <div className={`history-drawer ${isCollapsed ? 'collapsed' : ''}`} ref={drawerRef}>
      <div className="history-drawer-content">
        <div className="history-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="history-title">HISTORY</div>
            <button
              className="history-close-btn"
              onClick={() => setIsCollapsed(true)}
              title="Close History"
            >
              <X size={16} />
            </button>
          </div>
          <div className="history-count">
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{history.length}</span> ENGINES SYNTHESIZED
          </div>
        </div>

        {history.length > 0 && (
          <button className="history-scroll-btn up" onClick={() => scrollHistory('up')} title="Scroll Up">
            <ChevronUp size={14} />
          </button>
        )}

        <div className="history-list" ref={historyRef}>
          {history.length === 0 ? (
            <div className="history-empty">
              <div style={{ opacity: 0.5, marginBottom: 12 }}>
                <Zap size={24} />
              </div>
              <div style={{ fontWeight: 700, letterSpacing: '0.1em' }}>NO ARCHIVES FOUND</div>
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6 }}>READY TO LOG SYNTHESIS DATA</div>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="history-item"
                onClick={() => onHistoryClick(item)}
              >
                <div className="history-thumb">
                  <img src={item.imageUrl} alt="History" loading="lazy" />
                  <div className="history-item-overlay">
                    <Zap size={16} fill="currentColor" />
                  </div>
                </div>
                <div className="history-item-details">
                  <div className="history-item-prompt">
                    {item.prompt}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <div className="history-item-time" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={8} />
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {item.steps && (
                      <div className="history-item-time" style={{ color: 'var(--accent)' }}>
                        {item.steps} STEPS
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {history.length > 0 && (
          <button className="history-scroll-btn down" onClick={() => scrollHistory('down')} title="Scroll Down">
            <ChevronDown size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HistoryItem } from '@/types';
import useStore from '@/lib/store';

interface HistoryDrawerProps {
  history: HistoryItem[];
  onHistoryClick: (item: HistoryItem) => void;
}

export default function HistoryDrawer({ history, onHistoryClick }: HistoryDrawerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const { generation } = useStore();

  const scrollHistory = (direction: 'up' | 'down') => {
    if (historyRef.current) {
      const scrollAmount = 300;
      historyRef.current.scrollBy({
        top: direction === 'up' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [history.length]);

  return (
    <div className={`history-drawer ${isCollapsed ? 'collapsed' : ''}`}>
      <div 
        className="history-drawer-trigger"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="history-drawer-label">HISTORY</span>
        <ChevronRight size={14} className={`history-drawer-icon ${isCollapsed ? '' : 'open'}`} />
      </div>
      
      <div className="history-drawer-content">
        <div className="history-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="label">HISTORY</span>
            <span className="count">{history.length} ITEMS</span>
          </div>
          <div className="history-nav">
            <button className="nav-btn" onClick={() => scrollHistory('up')}>
              <ChevronLeft size={14} />
            </button>
            <button className="nav-btn" onClick={() => scrollHistory('down')}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="history-bar" ref={historyRef}>
          {history.length === 0 ? (
            <div className="history-empty">NO RECENT GENERATIONS</div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`history-thumb ${generation.image === item.imageUrl ? 'active' : ''}`}
                onClick={() => onHistoryClick(item)}
              >
                <img src={item.imageUrl} alt="History" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

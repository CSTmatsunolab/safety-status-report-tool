// src/components/ZoomProvider.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ズームレベルの定義（%）- 上限を200%に拡大
const ZOOM_LEVELS = [80, 90, 100, 110, 120, 130, 150, 175, 200];
const DEFAULT_ZOOM_INDEX = 3; // 110%を初期値に

interface ZoomContextType {
  zoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [mounted, setMounted] = useState(false);

  // ローカルストレージからズームレベルを復元
  useEffect(() => {
    const saved = localStorage.getItem('appZoomIndex');
    if (saved !== null) {
      const index = parseInt(saved, 10);
      if (index >= 0 && index < ZOOM_LEVELS.length) {
        setZoomIndex(index);
      }
    }
    setMounted(true);
  }, []);

  // ズームレベルをCSSに適用
  useEffect(() => {
    if (!mounted) return;
    
    const zoomPercent = ZOOM_LEVELS[zoomIndex];
    // base-font-sizeを動的に変更（globals.cssの11pxを基準に）
    const baseFontSize = 11 * (zoomPercent / 100);
    document.documentElement.style.setProperty('--base-font-size', `${baseFontSize}px`);
    
    // spacing-scaleも調整
    const baseScale = 0.6 * (zoomPercent / 100);
    document.documentElement.style.setProperty('--spacing-scale', baseScale.toString());
  }, [zoomIndex, mounted]);

  const saveZoomIndex = (index: number) => {
    localStorage.setItem('appZoomIndex', index.toString());
  };

  const zoomIn = () => {
    if (zoomIndex < ZOOM_LEVELS.length - 1) {
      const newIndex = zoomIndex + 1;
      setZoomIndex(newIndex);
      saveZoomIndex(newIndex);
    }
  };

  const zoomOut = () => {
    if (zoomIndex > 0) {
      const newIndex = zoomIndex - 1;
      setZoomIndex(newIndex);
      saveZoomIndex(newIndex);
    }
  };

  return (
    <ZoomContext.Provider value={{
      zoomLevel: ZOOM_LEVELS[zoomIndex],
      zoomIn,
      zoomOut,
      canZoomIn: zoomIndex < ZOOM_LEVELS.length - 1,
      canZoomOut: zoomIndex > 0,
    }}>
      {children}
    </ZoomContext.Provider>
  );
}

export function useZoom() {
  const context = useContext(ZoomContext);
  if (!context) {
    throw new Error('useZoom must be used within a ZoomProvider');
  }
  return context;
}
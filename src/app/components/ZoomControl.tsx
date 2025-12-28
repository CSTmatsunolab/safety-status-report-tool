// src/components/ZoomControl.tsx
'use client';

import { useState, useEffect } from 'react';
import { FiZoomIn, FiZoomOut, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useZoom } from './ZoomProvider';

export function ZoomControl() {
  const { zoomLevel, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ローカルストレージから折りたたみ状態を復元
  useEffect(() => {
    const saved = localStorage.getItem('zoomControlCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
    setMounted(true);
  }, []);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('zoomControlCollapsed', newState.toString());
  };

  // マウント前は非表示（ハイドレーションエラー防止）
  if (!mounted) {
    return null;
  }

  // ズームレベルに応じてサイズを調整（100%を基準にスケール）
  const scale = zoomLevel / 100;
  
  // 各サイズをズームレベルに応じて計算
  const buttonSize = Math.round(28 * scale);
  const largeButtonSize = Math.round(32 * scale);
  const iconSize = Math.round(16 * scale);
  const fontSize = Math.round(12 * scale);
  const smallFontSize = Math.round(11 * scale);
  const minWidth = Math.round(44 * scale);
  const padding = isCollapsed ? Math.round(4 * scale) : `${Math.round(4 * scale)}px ${Math.round(6 * scale)}px`;
  const bottomPosition = Math.round(16 * scale);
  const rightPosition = Math.round(16 * scale);

  return (
    <div 
      className="fixed z-50 flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-all duration-200"
      style={{
        bottom: `${bottomPosition}px`,
        right: `${rightPosition}px`,
        fontSize: `${fontSize}px`,
        lineHeight: '1.4',
        padding: typeof padding === 'string' ? padding : `${padding}px`,
      }}
    >
      {/* 折りたたみ/展開ボタン */}
      <button
        onClick={toggleCollapse}
        className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
        style={{ 
          width: `${buttonSize}px`, 
          height: `${buttonSize}px`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
        title={isCollapsed ? '展開' : '折りたたむ'}
        aria-label={isCollapsed ? 'Expand zoom control' : 'Collapse zoom control'}
      >
        {isCollapsed ? (
          <FiChevronLeft style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
        ) : (
          <FiChevronRight style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
        )}
      </button>

      {/* 展開時のみ表示 */}
      {!isCollapsed && (
        <>
          <button
            onClick={zoomOut}
            disabled={!canZoomOut}
            className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
            style={{ 
              width: `${largeButtonSize}px`, 
              height: `${largeButtonSize}px`, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
            title="縮小"
            aria-label="Zoom out"
          >
            <FiZoomOut style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
          </button>
          
          <span 
            className="font-medium text-center text-gray-700 dark:text-gray-300"
            style={{ minWidth: `${minWidth}px`, fontSize: `${fontSize}px` }}
          >
            {zoomLevel}%
          </span>
          
          <button
            onClick={zoomIn}
            disabled={!canZoomIn}
            className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
            style={{ 
              width: `${largeButtonSize}px`, 
              height: `${largeButtonSize}px`, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
            title="拡大"
            aria-label="Zoom in"
          >
            <FiZoomIn style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
          </button>
        </>
      )}

      {/* 折りたたみ時はズームレベルのみ表示 */}
      {isCollapsed && (
        <span 
          className="font-medium text-center text-gray-600 dark:text-gray-400"
          style={{ fontSize: `${smallFontSize}px`, marginRight: `${Math.round(4 * scale)}px` }}
        >
          {zoomLevel}%
        </span>
      )}
    </div>
  );
}
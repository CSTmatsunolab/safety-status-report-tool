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

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-all duration-200"
      style={{
        // ズームの影響を受けないように固定サイズ
        fontSize: '12px',
        lineHeight: '1.4',
        padding: isCollapsed ? '4px' : '4px 6px',
      }}
    >
      {/* 折りたたみ/展開ボタン */}
      <button
        onClick={toggleCollapse}
        className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title={isCollapsed ? '展開' : '折りたたむ'}
        aria-label={isCollapsed ? 'Expand zoom control' : 'Collapse zoom control'}
      >
        {isCollapsed ? (
          <FiChevronLeft style={{ width: '16px', height: '16px' }} />
        ) : (
          <FiChevronRight style={{ width: '16px', height: '16px' }} />
        )}
      </button>

      {/* 展開時のみ表示 */}
      {!isCollapsed && (
        <>
          <button
            onClick={zoomOut}
            disabled={!canZoomOut}
            className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="縮小"
            aria-label="Zoom out"
          >
            <FiZoomOut style={{ width: '16px', height: '16px' }} />
          </button>
          
          <span 
            className="font-medium text-center text-gray-700 dark:text-gray-300"
            style={{ minWidth: '44px', fontSize: '12px' }}
          >
            {zoomLevel}%
          </span>
          
          <button
            onClick={zoomIn}
            disabled={!canZoomIn}
            className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="拡大"
            aria-label="Zoom in"
          >
            <FiZoomIn style={{ width: '16px', height: '16px' }} />
          </button>
        </>
      )}

      {/* 折りたたみ時はズームレベルのみ表示 */}
      {isCollapsed && (
        <span 
          className="font-medium text-center text-gray-600 dark:text-gray-400"
          style={{ fontSize: '11px', marginRight: '4px' }}
        >
          {zoomLevel}%
        </span>
      )}
    </div>
  );
}
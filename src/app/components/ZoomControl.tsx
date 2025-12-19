// src/components/ZoomControl.tsx
'use client';

import { FiZoomIn, FiZoomOut } from 'react-icons/fi';
import { useZoom } from './ZoomProvider';

export function ZoomControl() {
  const { zoomLevel, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom();

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 px-1.5 py-1"
      style={{
        // ズームの影響を受けないように固定サイズ
        fontSize: '12px',
        lineHeight: '1.4',
      }}
    >
      <button
        onClick={zoomOut}
        disabled={!canZoomOut}
        className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
        style={{ width: '35px', height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="縮小"
        aria-label="Zoom out"
      >
        <FiZoomOut style={{ width: '18px', height: '18px' }} />
      </button>
      
      <span 
        className="font-medium text-center text-gray-700 dark:text-gray-300"
        style={{ minWidth: '48px', fontSize: '13px' }}
      >
        {zoomLevel}%
      </span>
      
      <button
        onClick={zoomIn}
        disabled={!canZoomIn}
        className="rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
        style={{ width: '35px', height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="拡大"
        aria-label="Zoom in"
      >
        <FiZoomIn style={{ width: '18px', height: '18px' }} />
      </button>
    </div>
  );
}
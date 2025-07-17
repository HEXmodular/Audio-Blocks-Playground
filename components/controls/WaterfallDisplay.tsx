
import React, { useRef, useEffect, useLayoutEffect } from 'react';

interface WaterfallDisplayProps {
  // Массив цветов для новой строки, например ['#ff0000', '#00ff00', ...]
  newRowData: string[];
  width?: string; // CSS ширина, например '100%'
  height?: string; // CSS высота, например '300px'
}

const WaterfallDisplay: React.FC<WaterfallDisplayProps> = ({
  newRowData,
  width = '100%',
  height = '300px',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Этот эффект следит за размером контейнера и подгоняет размер холста
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      // Устанавливаем внутренний размер холста равным его отображаемому размеру
      // Это важно для предотвращения размытия
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!newRowData || newRowData.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    if (canvasWidth === 0 || canvasHeight === 0) return;

    // 1. Сдвигаем существующее изображение на 1px вниз
    // Мы рисуем текущий холст на самом себе со смещением
    ctx.drawImage(canvas, 0, 1);

    // 2. Рисуем новую строку пикселей вверху
    const pixelWidth = canvasWidth / newRowData.length;

    newRowData.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(i * pixelWidth, 0, Math.ceil(pixelWidth), 1); // Math.ceil для избежания зазоров
    });

  }, [newRowData]); // Перерисовываем только когда приходят новые данные

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, backgroundColor: 'black' }}
    />
  );
};

export default WaterfallDisplay;

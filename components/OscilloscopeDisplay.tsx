import React, { useEffect, useRef } from 'react';

interface OscilloscopeDisplayProps {
  analyserNode: AnalyserNode;
  fftSize: number; // This determines the buffer size for getTimeDomainData
  width?: number;
  height?: number;
  lineColor?: string;
  backgroundColor?: string;
}

const OscilloscopeDisplay: React.FC<OscilloscopeDisplayProps> = ({
  analyserNode,
  fftSize,
  width = 300,
  height = 150,
  lineColor = '#67e8f9', // sky-300
  backgroundColor = '#374151', // gray-700
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Ensure analyserNode's fftSize is consistent with the buffer we'll use.
    // Note: AnalyserNode.fftSize must be a power of 2. The time domain data buffer
    // will have `analyserNode.frequencyBinCount` elements, which is `fftSize / 2`.
    // However, getTimeDomainData uses a buffer of size `analyserNode.fftSize`.
    // Let's assume the fftSize prop is correctly set on the AnalyserNode.
    // analyserNode.fftSize = fftSize; // This should be set when AnalyserNode is created/updated

    const bufferLength = analyserNode.fftSize; // Use fftSize for time domain data buffer
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      animationFrameIdRef.current = requestAnimationFrame(draw);

      analyserNode.getFloatTimeDomainData(dataArray);

      canvasCtx.fillStyle = backgroundColor;
      canvasCtx.fillRect(0, 0, width, height);

      canvasCtx.lineWidth = 1.5;
      canvasCtx.strokeStyle = lineColor;
      canvasCtx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // dataArray values are typically between -1.0 and 1.0
        const v = dataArray[i] / 1.0; // Normalize if needed, though it usually is already
        const y = (v * height) / 2 + height / 2; // Scale and shift to canvas coordinates

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      canvasCtx.lineTo(width, height / 2); // Draw line to the end at center
      canvasCtx.stroke();
    };

    draw();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [analyserNode, fftSize, width, height, lineColor, backgroundColor]);

  // Set ARIA attributes for accessibility
  const ariaLabel = "Oscilloscope displaying audio waveform";

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="rounded-md border border-gray-600"
      role="img"
      aria-label={ariaLabel}
    ></canvas>
  );
};

export default OscilloscopeDisplay;

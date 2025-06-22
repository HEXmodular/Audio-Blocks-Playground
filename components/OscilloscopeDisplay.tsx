import React, { useEffect, useRef } from 'react';

interface OscilloscopeDisplayProps {
  analyserNode: AnalyserNode | null; // Allow analyserNode to be null
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
    if (!analyserNode) {
      // If analyserNode is null, clear the canvas or display a message
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, width, height);
          ctx.font = '14px Arial';
          ctx.fillStyle = lineColor;
          ctx.textAlign = 'center';
          ctx.fillText('Oscilloscope not available', width / 2, height / 2);
        }
      }
      return; // Don't proceed with drawing if analyserNode is null
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Ensure analyserNode's fftSize is consistent with the buffer we'll use.
    // analyserNode.fftSize = fftSize; // This should be set when AnalyserNode is created/updated

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      if (!analyserNode) return; // Check again in case it becomes null during animation loop
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
        const v = dataArray[i];
        const y = (v * height) / 2 + height / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      canvasCtx.lineTo(width, height / 2);
      canvasCtx.stroke();
    };

    draw();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [analyserNode, fftSize, width, height, lineColor, backgroundColor]);

  const ariaLabel = analyserNode ? "Oscilloscope displaying audio waveform" : "Oscilloscope not available";

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

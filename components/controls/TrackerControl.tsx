import React, { useState, useEffect } from 'react';
import styles from './TrackerControl.module.css';

interface TrackerControlProps {
  rows: number;
  data?: string[];
  onDataChange?: (data: string[]) => void;
  activeRow?: number;
}

const TrackerControl: React.FC<TrackerControlProps> = ({
  rows,
  data,
  onDataChange,
  activeRow,
}) => {
  const [grid, setGrid] = useState<string[]>([]);

  useEffect(() => {
    const newGrid = Array.from({ length: rows }, (_, r) => data?.[r] || '..');
    setGrid(newGrid);
  }, [rows, data]);

  const handleNoteChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    const newGrid = grid.map((cell, cIdx) => {
      if (cIdx === rowIndex) {
        return e.target.value;
      }
      return cell;
    });
    setGrid(newGrid);
    if (onDataChange) {
      onDataChange(newGrid);
    }
  };

  const handleFocus = (rowIndex: number) => {
    if (grid[rowIndex] === '..') {
      const newGrid = [...grid];
      newGrid[rowIndex] = '';
      setGrid(newGrid);
    }
  };

  const handleBlur = (rowIndex: number) => {
    if (grid[rowIndex] === '') {
      const newGrid = [...grid];
      newGrid[rowIndex] = '..';
      setGrid(newGrid);
      if (onDataChange) {
        onDataChange(newGrid);
      }
    }
  };


  return (
    <div>
      {grid.map((cell, rowIndex) => (
        <>
          <div
            key={rowIndex}
            className={`${styles.cell} ${rowIndex === activeRow ? styles.activeCell : ''}`}
          >
            <input
              type="text"
              value={cell}
              onChange={(e) => handleNoteChange(e, rowIndex)}
              onFocus={() => handleFocus(rowIndex)}
              onBlur={() => handleBlur(rowIndex)}
              className={styles.input}
            />
          </div>
        </>
      ))}
    </div>
  );
};

export default TrackerControl;

import React, { useState, useEffect } from 'react';

interface TrackerControlProps {
  rows: number;
  cols: number;
  data?: string[][];
  onDataChange?: (data: string[][]) => void;
  activeRow?: number;
}

const TrackerControl: React.FC<TrackerControlProps> = ({
  rows,
  cols,
  data,
  onDataChange,
  activeRow,
}) => {
  const [grid, setGrid] = useState<string[][]>([]);
  useEffect(() => {
    const newGrid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        return data?.[r]?.[c] || '..';
      })
    );
    setGrid(newGrid);
  }, [rows, cols, data]);

  const handleNoteChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const newGrid = grid.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        return row.map((cell, cIdx) => {
          if (cIdx === colIndex) {
            return e.target.value;
          }
          return cell;
        });
      }
      return row;
    });
    setGrid(newGrid);
    if (onDataChange) {
      onDataChange(newGrid);
    }
  };

  const handleCopy = () => {
    const gridString = JSON.stringify(grid);
    navigator.clipboard.writeText(gridString);
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    try {
      const newGrid = JSON.parse(text);
      if (
        !Array.isArray(newGrid) ||
        !newGrid.every((row) => Array.isArray(row))
      ) {
        return;
      }
      setGrid(newGrid);
      if (onDataChange) {
        onDataChange(newGrid);
      }

    } catch (error) {
      console.error('Failed to parse clipboard data:', error);
    }
  };

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      fontFamily: 'monospace',
      display: 'inline-block',
      border: '1px solid #ccc',
      padding: '10px',
    },
    table: {
      borderCollapse: 'collapse',
    },
    cell: {
      border: '1px solid #eee',
      padding: '0',
    },
    activeCell: {
      backgroundColor: '#d3e3ff',
    },
    input: {
      width: '50px',
      height: '25px',
      textAlign: 'center',
      border: 'none',
      background: 'transparent',
      fontFamily: 'monospace',
    },
    button: {
      margin: '5px',
      padding: '5px 10px',
      fontFamily: 'monospace',
    },
  };

  return (
    <div style={styles.container}>
      <div>
        <button onClick={handleCopy} style={styles.button}>
          Copy
        </button>
        <button onClick={handlePaste} style={styles.button}>
          Paste
        </button>
      </div>
      {grid.map((row, rowIndex) => (
        <>
          {row.map((cell, colIndex) => (
            <div
              key={colIndex}
              style={{
                ...styles.cell,
                ...(rowIndex === activeRow ? styles.activeCell : {}),
              }}
            >
              <input
                type="text"
                value={cell}
                onChange={(e) => handleNoteChange(e, rowIndex, colIndex)}
                style={styles.input}
              />
            </div>
          ))}
        </>
      ))}
    </div>
  );
};

export default TrackerControl;

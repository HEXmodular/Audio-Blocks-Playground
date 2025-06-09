

import React from 'react';

export const CodeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
  </svg>
);

export const DocumentTextIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

export const CommandLineIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

export const BeakerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.083A12.042 12.042 0 0014.003 6A9.003 9.003 0 006 14.003c0 .176.005.35.013.525M14.25 6.083C14.25 5.66 13.947 5.304 13.542 5.217 12.22 5.003 10.962 4 9.375 4H7.125C5.538 4 4.28 5.003 3 6.083m11.25 0v5.564c0 .222-.018.441-.052.655M3 6.083v5.564c0 .222.018.441.052.655m11.146-5.034a5.021 5.021 0 01-3.684 2.422M3.052 12.302a5.021 5.021 0 003.684 2.422m7.5-4.844V14.25c0 .621.504 1.125 1.125 1.125h.75c.621 0 1.125-.504 1.125-1.125V9.813c0-.222-.018-.441-.052-.655M6.75 9.813V14.25c0 .621-.504 1.125-1.125 1.125H4.875A1.125 1.125 0 013.75 14.25V9.813c0-.222.018-.441.052-.655M12 11.25h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);


export const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
);

export const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);


export const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c1.153 0 2.24.032 3.22.096M15 5.25a3 3 0 00-3-3m0 3a3 3 0 01-3-3m0 3V4.5m3 3V4.5m0 9h.008v.008H12v-.008zm0 0H9.75m5.69-1.04l-1.224-4.896a.75.75 0 00-1.422 0L11.25 13.5m0 0h1.5m-1.5 0l-1.406-4.439a.75.75 0 00-1.362 0L7.5 13.5m0 0H9m3.75-3.75H6.25m9.698 0a3.375 3.375 0 013.09 2.619m-3.09-2.62L15 3M6.25 7.5l-2.31 9.24A2.25 2.25 0 006.216 19.5h11.568a2.25 2.25 0 002.276-2.76L17.75 7.5M9 13.5V9.75M15 13.5V9.75" />
  </svg>
);

export const SmallTrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className || "w-4 h-4"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c1.153 0 2.24.032 3.22.096M15 5.25a3 3 0 00-3-3m0 3a3 3 0 01-3-3m0 3V4.5m3 3V4.5m0 9h.008v.008H12v-.008zm0 0H9.75m5.69-1.04l-1.224-4.896a.75.75 0 00-1.422 0L11.25 13.5m0 0h1.5m-1.5 0l-1.406-4.439a.75.75 0 00-1.362 0L7.5 13.5m0 0H9m3.75-3.75H6.25m9.698 0a3.375 3.375 0 013.09 2.619m-3.09-2.62L15 3M6.25 7.5l-2.31 9.24A2.25 2.25 0 006.216 19.5h11.568a2.25 2.25 0 002.276-2.76L17.75 7.5M9 13.5V9.75M15 13.5V9.75" />
  </svg>
);


export const ArrowPathIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

export const LightBulbIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.31M8.25 18.75a12.063 12.063 0 004.5 0m0 0v-.375c0-.621-.504-1.125-1.125-1.125H12a1.125 1.125 0 01-1.125-1.125V11.25m0-3.75v.375c0 .621.504 1.125 1.125 1.125H12m3.75-3.375V6.75c0-1.036-.84-1.875-1.875-1.875h-3.75A1.875 1.875 0 008.25 6.75v3.375c0 .621.504 1.125 1.125 1.125h.094c.026 0 .051.01.076.018m0 0a4.501 4.501 0 013.232 1.238M12 11.25a4.5 4.5 0 00-3.332 1.238" />
  </svg>
);

export const LinkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);

export const CpuChipIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M8.25 21v-1.5M15.75 3v1.5M19.5 8.25H21M15.75 21v-1.5M12 5.25v13.5M12 5.25a2.25 2.25 0 012.25 2.25H9.75A2.25 2.25 0 0112 5.25z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5v4.5H3.75v-4.5zM3.75 9.75a2.25 2.25 0 012.25-2.25h12a2.25 2.25 0 012.25 2.25M3.75 14.25a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25M8.25 9.75h7.5v4.5h-7.5v-4.5z" />
  </svg>
);

export const ExclamationTriangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-6 h-6"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

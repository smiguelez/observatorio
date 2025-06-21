// src/components/ui/button.jsx
import React from 'react';

export function Button({ children, onClick, type = 'button', className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// src/components/ui/card.jsx
import React from 'react';

export function Card({ children, className = '', style }) {
  return <div 
    className={`rounded-lg shadow-md p-4 ${className}`}
    style={style}
    >
      {children}
    </div>;
}

export function CardHeader({ children }) {
  return <div className="mb-2">{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>;
}

export function CardContent({ children }) {
  return <div className="mt-2">{children}</div>;
}

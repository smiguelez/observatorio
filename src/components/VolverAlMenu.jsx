// src/components/VolverAlMenu.jsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';

export default function VolverAlMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  // No mostrarlo en el menú principal
  if (location.pathname === "/") {
    return null;
  }

  return (
    <Button
      variant="secondary"
      onClick={() => navigate('/')}
      className="mr-4"
    >
      Volver al menú
    </Button>
  );
}

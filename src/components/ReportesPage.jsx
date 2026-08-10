import React from 'react';

export default function ReportesPage() {
  return (
    <div
      className="reportes-container shadow-lg rounded-lg overflow-hidden border border-blue-200"
      style={{ height: 'calc(100vh - 120px)' }}
    >
      <iframe
        width="100%"
        height="100%"
        src="https://datastudio.google.com/embed/reporting/c3658d7d-bf21-44ca-a987-ab6868d7d6e7/page/p_4z6gkh1c6d"
        frameBorder="0"
        style={{ border: 0, display: 'block' }}
        allowFullScreen
        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title="Tablero - Reporte"
      />
    </div>
  );
}

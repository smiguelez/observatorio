import React from 'react';
import { Button } from './ui/button';

export default function ReportesPage() {
  const powerBiEmbedUrl = "https://app.powerbi.com/view?r=eyJrIjoiODVlNGI1MmItMDY0My00ZTA1LTk0MzAtZjkwM2FhNWI4NzljIiwidCI6IjdkM2M3MmEzLWFkYjctNGQ0My05YzBiLWU1MWMzZDk0ZmQyYSJ9";
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-blue-900">Panel de Reportes</h1>
          <p className="mt-2 text-blue-700 text-lg">
            Accedé a la visualización de datos del Observatorio Federal de Oficinas Judiciales.
          </p>
        </div>

        <div className="shadow-lg rounded-lg overflow-hidden border border-blue-200">
          <iframe
            title="Power BI Report"
            src={powerBiEmbedUrl}
            width="100%"
            height="700"
            frameBorder="0"
            allowFullScreen={true}
          ></iframe>
        </div>

        <div className="text-center mt-6">
          <Button
            onClick={() => window.location.reload()}
          >
            Refrescar Reporte
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OrganismoForm from "./OrganismoForm";
import ListaUnidadesFuncionalesForm from "./ListaUnidadesFuncionalesForm";
import TaxonomiaForm from "./TaxonomiaForm";
import { Button } from "@/components/ui/button";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";

const estructuraVacia = {
  v1: {
    gestion: { autonomia: '' },
    institucional: { insercion_institucional: '', jerarquia_normativa: '' },
    organizacion: { dependencia: '', asistencia_jurisdiccional: '' },
    implementacion: {
      alcance_proceso: '',
      alcance_fuero: '',
      presencia_territorial: '',
      grado_implementacion: ''
    }
  }
};

export default function OrganismoDetailTabs({ organismo, setOrganismo, onVolver }) {
  const [tab, setTab] = useState("detalle");

  useEffect(() => {
    if (!organismo?.taxonomia) {
      setOrganismo((prev) => ({
        ...prev,
        taxonomia: estructuraVacia
      }));
    }
  }, [organismo, setOrganismo]);

  const handleGuardarTodo = async () => {
    try {
      const ref = doc(db, "organismos", organismo.id);
      const { id, actualizado_a, ...resto } = organismo;

      await updateDoc(ref, {
        ...resto,
        actualizado_a: new Date().toISOString()
      });

      alert("Cambios guardados correctamente.");
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar los datos.");
    }
  };

  return (
    <div className="p-6 bg-white shadow rounded-xl">
      {/* Header con volver y guardar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-blue-800">Datos del Organismo</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onVolver}>
            ← Volver
          </Button>
          <Button onClick={handleGuardarTodo}>
            Guardar Cambios
          </Button>
        </div>
      </div>

      {/* Pestañas */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-gray-100 rounded-xl p-1 flex gap-2 mb-6 shadow-inner">
          <TabsTrigger
            value="detalle"
            className="text-lg px-4 py-2 border-b-2 data-[state=active]:border-blue-600 data-[state=active]:font-semibold"
          >
            Detalle
          </TabsTrigger>
          <TabsTrigger
            value="unidades"
            className="text-lg px-4 py-2 border-b-2 data-[state=active]:border-blue-600 data-[state=active]:font-semibold"
          >
            Unidades Funcionales
          </TabsTrigger>
          <TabsTrigger
            value="taxonomia"
            className="text-lg px-4 py-2 border-b-2 data-[state=active]:border-blue-600 data-[state=active]:font-semibold"
          >
            Taxonomía
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detalle">
          <OrganismoForm organismo={organismo} setOrganismo={setOrganismo} />
        </TabsContent>

        <TabsContent value="unidades">
          <ListaUnidadesFuncionalesForm organismoId={organismo?.id} onVolver={onVolver} />
        </TabsContent>

        <TabsContent value="taxonomia">
          <TaxonomiaForm
            taxonomia={organismo.taxonomia}
            onChange={(nuevaTaxonomia) => {
              setOrganismo((prev) => ({
                ...prev,
                taxonomia: nuevaTaxonomia
              }));
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

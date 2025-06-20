import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function UnidadFuncionalForm() {
  const { control, register } = useFormContext();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "unidades_funcionales"
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <h3 className="text-lg font-medium">Unidades Funcionales</h3>
      </CardHeader>
      <CardContent>
        {fields.map((field, index) => (
          <div key={field.id} className="border p-4 rounded-xl mb-4 space-y-3 bg-gray-50">
            <Input {...register(`unidades_funcionales.${index}.denominacion_unidad`)} label="Denominación de la unidad" placeholder="Ej. Oficina de Gestión Penal" />
            <Input {...register(`unidades_funcionales.${index}.localidad`)} label="Localidad" placeholder="Ej. Neuquén" />
            <Input {...register(`unidades_funcionales.${index}.latitud`)} label="Latitud" type="number" step="any" />
            <Input {...register(`unidades_funcionales.${index}.longitud`)} label="Longitud" type="number" step="any" />
            <Input {...register(`unidades_funcionales.${index}.domicilio`)} label="Domicilio" placeholder="Calle y número" />
            <Input {...register(`unidades_funcionales.${index}.jueces_asistidos`)} label="Jueces asistidos" type="number" />
            <Input {...register(`unidades_funcionales.${index}.anio_implementacion`)} label="Año de implementación" type="number" />
            <Input {...register(`unidades_funcionales.${index}.actualizado_a`)} label="Actualizado a" type="date" />
            <Button variant="destructive" type="button" onClick={() => remove(index)}>Eliminar unidad</Button>
          </div>
        ))}
        <Button type="button" onClick={() => append({})} className="mt-4">Agregar unidad funcional</Button>
      </CardContent>
    </Card>
  );
}

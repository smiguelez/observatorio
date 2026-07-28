import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';

const POOL_NUEVO = '__nuevo__';

export default function UnidadFuncionalForm({
  organismoId,
  provincia,
  localidades,
  editandoUF,
  onUnidadFuncionalGuardada,
  onCancelarEdicion
}) {
  const [nuevaUF, setNuevaUF] = useState({
    denominacion_unidad: '',
    localidad_id: '',
    tipo_uf: '',
    anio_implementacion: '',
    domicilio: '',
    jueces_asistidos: '',
    telefono: '',
    mail: '',
    responsable: '',
    codigo_postal: ''
  });

  const [modoJueces, setModoJueces] = useState('cantidad');
  const [pools, setPools] = useState([]);
  const [poolSeleccionado, setPoolSeleccionado] = useState('');
  const [nuevoPoolDescripcion, setNuevoPoolDescripcion] = useState('');
  const [nuevoPoolCantidad, setNuevoPoolCantidad] = useState('');

  const formRef = useRef(null);

  useEffect(() => {
    if (editandoUF) {
      // Si es creación, editandoUF es un objeto vacío {}
      setNuevaUF({
        denominacion_unidad: editandoUF.denominacion_unidad || '',
        localidad_id: editandoUF.localidad_id || '',
        tipo_uf: editandoUF.tipo_uf || '',
        anio_implementacion: editandoUF.anio_implementacion || '',
        domicilio: editandoUF.domicilio || '',
        jueces_asistidos: editandoUF.jueces_asistidos || '',
        telefono: editandoUF.telefono || '',
        mail: editandoUF.mail || '',
        responsable: editandoUF.responsable || '',
        codigo_postal: editandoUF.codigo_postal || ''
      });

      if (editandoUF.pool_jueces_id) {
        setModoJueces('pool');
        setPoolSeleccionado(editandoUF.pool_jueces_id);
      } else {
        setModoJueces('cantidad');
        setPoolSeleccionado('');
      }
      setNuevoPoolDescripcion('');
      setNuevoPoolCantidad('');

      // Scroll al formulario al iniciar edición/creación
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [editandoUF]);

  useEffect(() => {
    if (!provincia) {
      setPools([]);
      return;
    }

    const fetchPools = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'pools_jueces'), where('provincia', '==', provincia))
        );
        setPools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error al cargar pools de jueces:', error);
      }
    };

    fetchPools();
  }, [provincia]);

  const handleChange = (e) => {
    setNuevaUF({ ...nuevaUF, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!nuevaUF.denominacion_unidad || !nuevaUF.localidad_id) {
      alert("Por favor, completá los campos obligatorios.");
      return;
    }

    if (modoJueces === 'pool') {
      if (!poolSeleccionado) {
        alert("Seleccioná un tribunal / pool, o creá uno nuevo.");
        return;
      }
      if (poolSeleccionado === POOL_NUEVO && (!nuevoPoolDescripcion || !nuevoPoolCantidad)) {
        alert("Completá la descripción y la cantidad de jueces del nuevo tribunal / pool.");
        return;
      }
    }

    try {
      let poolIdFinal = null;
      let juecesAsistidosFinal = null;

      if (modoJueces === 'pool') {
        if (poolSeleccionado === POOL_NUEVO) {
          const nuevoPoolRef = await addDoc(collection(db, 'pools_jueces'), {
            descripcion: nuevoPoolDescripcion,
            cantidad_jueces: Number(nuevoPoolCantidad),
            provincia
          });
          poolIdFinal = nuevoPoolRef.id;
        } else {
          poolIdFinal = poolSeleccionado;
        }
      } else {
        juecesAsistidosFinal = nuevaUF.jueces_asistidos;
      }

      const payload = {
        ...nuevaUF,
        jueces_asistidos: juecesAsistidosFinal,
        pool_jueces_id: poolIdFinal
      };

      if (editandoUF && editandoUF.id) {
        // Modo edición
        const ref = doc(
          db,
          `organismos/${organismoId}/unidades_funcionales/${editandoUF.id}`
        );
        await updateDoc(ref, payload);
        console.log("✅ UF actualizada:", payload);
      } else {
        // Modo creación
        await addDoc(
          collection(db, `organismos/${organismoId}/unidades_funcionales`),
          payload
        );
        console.log("✅ UF agregada:", payload);
      }

      await actualizarActualizadoA();

      if (typeof onUnidadFuncionalGuardada === 'function') {
        onUnidadFuncionalGuardada();
      }

      // Cierra el formulario
      if (typeof onCancelarEdicion === 'function') {
        onCancelarEdicion();
      }

    } catch (error) {
      console.error("❌ Error guardando UF:", error);
      alert(`Error guardando la unidad funcional: ${error.message}`);
    }
  };

  const actualizarActualizadoA = async () => {
    try {
      const organismoRef = doc(db, 'organismos', organismoId);
      await updateDoc(organismoRef, {
        actualizado_a: serverTimestamp()
      });

      console.log('✅ Timestamp actualizado correctamente.');

      const organismoSnap = await getDoc(organismoRef);
      if (organismoSnap.exists()) {
        console.log('✅ Valor de actualizado_a:', organismoSnap.data().actualizado_a);
      } else {
        console.log("⚠ El documento del organismo no existe.");
      }
    } catch (error) {
      console.error("❌ Error actualizando timestamp:", error);
      alert(`Error actualizando timestamp: ${error.message}`);
    }
  };

  if (!editandoUF) {
    // ⚠ No mostrar nada si no se está editando o creando
    return null;
  }

  return (
    <div ref={formRef} className="space-y-6 mt-8 border-t pt-6">
      <h2 className="text-xl font-semibold text-gray-800">
        {editandoUF.id
          ? 'Editar Unidad Funcional'
          : 'Agregar Nueva Unidad Funcional'}
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="denominacion_unidad" className="block text-sm font-medium text-gray-700">
              Denominación de la Unidad Funcional:
            </label>
            <Input
              id="denominacion_unidad"
              name="denominacion_unidad"
              value={nuevaUF.denominacion_unidad}
              onChange={handleChange}
              placeholder="Denominación"
            />
          </div>

          <div>
            <label htmlFor="localidad_id" className="block text-sm font-medium text-gray-700">
              Localidad:
            </label>
            <select
              id="localidad_id"
              name="localidad_id"
              value={nuevaUF.localidad_id}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded text-sm"
            >
              <option value="">Seleccionar Localidad</option>
              {localidades?.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.nombre} ({loc.provincia})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="anio_implementacion" className="block text-sm font-medium text-gray-700">
              Año de Implementación:
            </label>
            <Input
              id="anio_implementacion"
              name="anio_implementacion"
              value={nuevaUF.anio_implementacion}
              onChange={handleChange}
              placeholder="Año de Implementación"
            />
          </div>

          <div>
            <label htmlFor="domicilio" className="block text-sm font-medium text-gray-700">
              Domicilio:
            </label>
            <Input
              id="domicilio"
              name="domicilio"
              value={nuevaUF.domicilio}
              onChange={handleChange}
              placeholder="Domicilio"
            />
          </div>

          <div className="md:col-span-2 space-y-3">
            <span className="block text-sm font-medium text-gray-700">Jueces Asistidos:</span>

            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="radio"
                  name="modo_jueces"
                  checked={modoJueces === 'cantidad'}
                  onChange={() => setModoJueces('cantidad')}
                  className="accent-blue-600"
                />
                Cantidad de jueces
              </label>
              <label
                className={`flex items-center gap-1.5 text-sm cursor-pointer select-none ${
                  provincia ? 'text-gray-700' : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                <input
                  type="radio"
                  name="modo_jueces"
                  checked={modoJueces === 'pool'}
                  disabled={!provincia}
                  onChange={() => setModoJueces('pool')}
                  className="accent-blue-600"
                />
                Asociar a tribunal / pool
              </label>
            </div>

            {modoJueces === 'cantidad' && (
              <Input
                id="jueces_asistidos"
                name="jueces_asistidos"
                value={nuevaUF.jueces_asistidos}
                onChange={handleChange}
                placeholder="Jueces Asistidos"
              />
            )}

            {modoJueces === 'pool' && (
              !provincia ? (
                <p className="text-sm text-gray-400 italic">Cargando provincia del organismo...</p>
              ) : (
                <div className="space-y-3">
                  <select
                    id="pool_jueces_id"
                    value={poolSeleccionado}
                    onChange={e => setPoolSeleccionado(e.target.value)}
                    className="w-full border px-3 py-2 rounded text-sm"
                  >
                    <option value="">Seleccionar tribunal / pool</option>
                    {pools.map(p => (
                      <option key={p.id} value={p.id}>{p.descripcion}</option>
                    ))}
                    <option value={POOL_NUEVO}>+ Crear nuevo tribunal / pool</option>
                  </select>

                  {poolSeleccionado === POOL_NUEVO && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="nuevo_pool_descripcion" className="block text-sm font-medium text-gray-700">
                          Descripción del tribunal / pool:
                        </label>
                        <Input
                          id="nuevo_pool_descripcion"
                          value={nuevoPoolDescripcion}
                          onChange={e => setNuevoPoolDescripcion(e.target.value)}
                          placeholder="Descripción"
                        />
                      </div>
                      <div>
                        <label htmlFor="nuevo_pool_cantidad" className="block text-sm font-medium text-gray-700">
                          Cantidad de jueces del pool:
                        </label>
                        <Input
                          id="nuevo_pool_cantidad"
                          type="number"
                          value={nuevoPoolCantidad}
                          onChange={e => setNuevoPoolCantidad(e.target.value)}
                          placeholder="Cantidad de jueces"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <div>
            <label htmlFor="tipo_uf" className="block text-sm font-medium text-gray-700">
              Tipo de Unidad Funcional:
            </label>
            <select
              id="tipo_uf"
              name="tipo_uf"
              value={nuevaUF.tipo_uf}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded text-sm"
            >
              <option value="">Seleccionar Tipo de UF</option>
              <option value="Delegación">Delegación</option>
              <option value="Subdelegación">Subdelegación</option>
            </select>
          </div>

          <div>
            <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">
              Teléfono:
            </label>
            <Input
              id="telefono"
              name="telefono"
              value={nuevaUF.telefono}
              onChange={handleChange}
              placeholder="Teléfono"
            />
          </div>

          <div>
            <label htmlFor="mail" className="block text-sm font-medium text-gray-700">
              Correo Electrónico:
            </label>
            <Input
              id="mail"
              name="mail"
              value={nuevaUF.mail}
              onChange={handleChange}
              placeholder="Correo Electrónico"
            />
          </div>

          <div>
            <label htmlFor="responsable" className="block text-sm font-medium text-gray-700">
              Nombre del Responsable:
            </label>
            <Input
              id="responsable"
              name="responsable"
              value={nuevaUF.responsable}
              onChange={handleChange}
              placeholder="Nombre del Responsable"
            />
          </div>

          <div>
            <label htmlFor="codigo_postal" className="block text-sm font-medium text-gray-700">
              Código Postal:
            </label>
            <Input
              id="codigo_postal"
              name="codigo_postal"
              value={nuevaUF.codigo_postal}
              onChange={handleChange}
              placeholder="Código Postal"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button type="submit">
            {editandoUF.id ? 'Guardar Cambios' : 'Agregar Unidad Funcional'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancelarEdicion}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

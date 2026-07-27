import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  denominacionSimplificadaOptions,
  tipoOficinaOptions,
  fueroOptions,
  provinciaOptions
} from '@/constants/organismoOptions';

export default function CrearOrganismoForm({ user, isAdmin }) {
  const navigate = useNavigate();
  const [verificandoProvincia, setVerificandoProvincia] = useState(!isAdmin);
  const [provinciaUsuario, setProvinciaUsuario] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [organismo, setOrganismo] = useState({
    denominacion: '',
    denominacion_simplificada: '',
    tipo_oficina: '',
    provincia: '',
    fuero_simplificado: ''
  });

  useEffect(() => {
    if (isAdmin) {
      setVerificandoProvincia(false);
      return;
    }

    const verificarProvinciaUsuario = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.email));
        const provincia = userSnap.exists() ? (userSnap.data().provincia || '') : '';
        setProvinciaUsuario(provincia);
        if (provincia) {
          setOrganismo(prev => ({ ...prev, provincia }));
        }
      } catch (error) {
        console.error('Error verificando provincia del usuario:', error);
      } finally {
        setVerificandoProvincia(false);
      }
    };

    verificarProvinciaUsuario();
  }, [isAdmin, user.email]);

  const handleChange = (e) => {
    setOrganismo({ ...organismo, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !organismo.denominacion ||
      !organismo.denominacion_simplificada ||
      !organismo.tipo_oficina ||
      !organismo.provincia ||
      !organismo.fuero_simplificado
    ) {
      alert('Por favor, completá todos los campos.');
      return;
    }

    setGuardando(true);
    try {
      await addDoc(collection(db, 'organismos'), {
        denominacion: organismo.denominacion,
        denominacion_simplificada: organismo.denominacion_simplificada,
        tipo_oficina: organismo.tipo_oficina,
        provincia: organismo.provincia,
        fuero_simplificado: organismo.fuero_simplificado,
        usuario_google: user.email,
        editores: [],
        legacy_id: null,
        actualizado_a: serverTimestamp()
      });

      navigate('/organismos');
    } catch (error) {
      console.error('Error creando organismo:', error);
      alert(`Error creando el organismo: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  if (verificandoProvincia) {
    return <p className="p-6">Verificando permisos...</p>;
  }

  if (!isAdmin && !provinciaUsuario) {
    return (
      <div className="space-y-4 px-6 w-full max-w-2xl">
        <h2 className="text-xl font-semibold text-gray-800">Crear Organismo</h2>
        <p className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded p-4">
          No podés crear organismos todavía: no tenés una provincia asignada.
          Un administrador tiene que asignarte una provincia antes de que puedas
          dar de alta un organismo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 w-full">
      <h2 className="text-xl font-semibold text-gray-800">Crear Organismo</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-[200px_1fr] gap-y-4 gap-x-6 items-center max-w-4xl">
        <label htmlFor="denominacion" className="text-left font-medium text-gray-700">
          Denominación:
        </label>
        <Input
          id="denominacion"
          name="denominacion"
          value={organismo.denominacion}
          onChange={handleChange}
          placeholder="Denominación"
        />

        <label htmlFor="denominacion_simplificada" className="text-left font-medium text-gray-700">
          Denominación Simplificada:
        </label>
        <select
          id="denominacion_simplificada"
          name="denominacion_simplificada"
          value={organismo.denominacion_simplificada}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          <option value="">Seleccionar Denominación Simplificada</option>
          {denominacionSimplificadaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <label htmlFor="tipo_oficina" className="text-left font-medium text-gray-700">
          Tipo de Oficina:
        </label>
        <select
          id="tipo_oficina"
          name="tipo_oficina"
          value={organismo.tipo_oficina}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          <option value="">Seleccionar Tipo de Oficina</option>
          {tipoOficinaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <label htmlFor="fuero_simplificado" className="text-left font-medium text-gray-700">
          Fuero:
        </label>
        <select
          id="fuero_simplificado"
          name="fuero_simplificado"
          value={organismo.fuero_simplificado}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          <option value="">Seleccionar Fuero</option>
          {fueroOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <label htmlFor="provincia" className="text-left font-medium text-gray-700">
          Provincia:
        </label>
        {isAdmin ? (
          <select
            id="provincia"
            name="provincia"
            value={organismo.provincia}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded text-sm"
          >
            <option value="">Seleccionar Provincia</option>
            {provinciaOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <Input
            id="provincia"
            name="provincia"
            value={organismo.provincia}
            disabled
            className="bg-gray-100 text-gray-700 cursor-not-allowed"
          />
        )}

        <div className="col-span-2 mt-4">
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Crear Organismo'}
          </Button>
        </div>
      </form>
    </div>
  );
}

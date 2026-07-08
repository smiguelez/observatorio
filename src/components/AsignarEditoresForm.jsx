import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AsignarEditoresForm() {
  const [organismos, setOrganismos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provinciaSeleccionada, setProvinciaSeleccionada] = useState('');
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');

  const provincias = useMemo(() =>
    [...new Set(organismos.map(o => o.provincia || 'Sin provincia'))].sort((a, b) => a.localeCompare(b)),
    [organismos]
  );

  const organismosFiltrados = useMemo(() =>
    provinciaSeleccionada
      ? organismos.filter(o => (o.provincia || 'Sin provincia') === provinciaSeleccionada)
      : [],
    [organismos, provinciaSeleccionada]
  );

  const todosSeleccionados =
    organismosFiltrados.length > 0 &&
    organismosFiltrados.every(o => seleccionados.has(o.id));

  useEffect(() => {
    setSeleccionados(new Set());
    setEmailInput('');
    setEmailError('');
  }, [provinciaSeleccionada]);

  useEffect(() => {
    const fetchOrganismos = async () => {
      try {
        const snap = await getDocs(collection(db, 'organismos'));
        const lista = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.denominacion || '').localeCompare(b.denominacion || ''));
        setOrganismos(lista);
      } catch (error) {
        console.error('Error al cargar organismos:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrganismos();
  }, []);

  const toggleSeleccionado = (orgId) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const toggleSeleccionarTodos = () => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (todosSeleccionados) {
        organismosFiltrados.forEach(o => next.delete(o.id));
      } else {
        organismosFiltrados.forEach(o => next.add(o.id));
      }
      return next;
    });
  };

  const actualizarEditoresLocalmente = (orgId, updater) =>
    setOrganismos(prev =>
      prev.map(org =>
        org.id === orgId ? { ...org, editores: updater(org.editores || []) } : org
      )
    );

  const handleAgregar = async () => {
    const email = emailInput.trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      setEmailError('Formato de email inválido.');
      return;
    }

    const orgsSeleccionadas = organismosFiltrados.filter(o => seleccionados.has(o.id));
    if (orgsSeleccionadas.length === 0) {
      setEmailError('Seleccioná al menos un organismo.');
      return;
    }

    setEmailError('');
    try {
      await Promise.all(
        orgsSeleccionadas.map(org =>
          updateDoc(doc(db, 'organismos', org.id), { editores: arrayUnion(email) })
        )
      );
      orgsSeleccionadas.forEach(org => {
        actualizarEditoresLocalmente(org.id, prev =>
          prev.includes(email) ? prev : [...prev, email]
        );
      });
      setEmailInput('');
    } catch (error) {
      console.error('Error al agregar editores:', error);
      setEmailError('Error al guardar. Intentá de nuevo.');
    }
  };

  const handleQuitar = async (org, email) => {
    try {
      await updateDoc(doc(db, 'organismos', org.id), { editores: arrayRemove(email) });
      actualizarEditoresLocalmente(org.id, prev => prev.filter(e => e !== email));
    } catch (error) {
      console.error('Error al quitar editor:', error);
    }
  };

  if (loading) return <div className="p-4">Cargando organismos...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Asignar Editores por Organismo</h2>

      {/* Selector de provincia */}
      <select
        value={provinciaSeleccionada}
        onChange={e => setProvinciaSeleccionada(e.target.value)}
        className="border rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option value="">— Seleccioná una provincia —</option>
        {provincias.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {provinciaSeleccionada && organismosFiltrados.length === 0 && (
        <p className="text-sm text-gray-400 italic">No hay organismos para esta provincia.</p>
      )}

      {organismosFiltrados.length > 0 && (
        <>
          {/* Email único + botón agregar */}
          <div className="flex gap-2 items-start">
            <div className="flex-1 max-w-sm">
              <input
                type="email"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setEmailError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAgregar(); }}
                placeholder="nuevo@editor.com"
                className="w-full text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {emailError && (
                <p className="text-xs text-red-600 mt-1">{emailError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleAgregar}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Agregar a seleccionados
            </button>
          </div>

          {/* Seleccionar todos */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={todosSeleccionados}
              onChange={toggleSeleccionarTodos}
              className="w-4 h-4 accent-blue-600"
            />
            Seleccionar todos
          </label>

          {/* Lista de organismos */}
          <div className="space-y-3">
            {organismosFiltrados.map(org => (
              <div key={org.id} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={seleccionados.has(org.id)}
                      onChange={() => toggleSeleccionado(org.id)}
                      className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="font-semibold text-gray-800">
                          {org.denominacion || '(sin denominación)'}
                        </span>
                        <span className="text-xs text-gray-500">{org.provincia}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Owner: {org.usuario_google || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3">
                  {(org.editores || []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Sin editores asignados.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(org.editores || []).map(email => (
                        <li key={email} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-700">{email}</span>
                          <button
                            type="button"
                            onClick={() => handleQuitar(org, email)}
                            className="text-xs text-red-600 hover:text-red-800 hover:underline"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

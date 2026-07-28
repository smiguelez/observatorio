import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { provinciaOptions } from '@/constants/organismoOptions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_DISPONIBLES = ['usuario_normal', 'admin'];

export default function GestionUsuariosForm() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ediciones, setEdiciones] = useState({});
  const [estadoFila, setEstadoFila] = useState({});

  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoRol, setNuevoRol] = useState(new Set(['usuario_normal']));
  const [nuevaProvincia, setNuevaProvincia] = useState('');
  const [errorAlta, setErrorAlta] = useState('');
  const [guardandoAlta, setGuardandoAlta] = useState(false);

  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const lista = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id));
        setUsuarios(lista);
        setEdiciones(
          Object.fromEntries(
            lista.map(u => [u.id, { rol: new Set(u.rol || []), provincia: u.provincia || '' }])
          )
        );
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsuarios();
  }, []);

  const toggleRolEdicion = (userId, rol) => {
    setEdiciones(prev => {
      const actual = new Set(prev[userId].rol);
      if (actual.has(rol)) actual.delete(rol);
      else actual.add(rol);
      return { ...prev, [userId]: { ...prev[userId], rol: actual } };
    });
  };

  const cambiarProvinciaEdicion = (userId, provincia) => {
    setEdiciones(prev => ({ ...prev, [userId]: { ...prev[userId], provincia } }));
  };

  const guardarUsuario = async (userId) => {
    const { rol, provincia } = ediciones[userId];
    setEstadoFila(prev => ({ ...prev, [userId]: { guardando: true, error: '' } }));
    try {
      await updateDoc(doc(db, 'users', userId), {
        rol: [...rol],
        provincia,
      });
      setUsuarios(prev =>
        prev.map(u => (u.id === userId ? { ...u, rol: [...rol], provincia } : u))
      );
      setEstadoFila(prev => ({ ...prev, [userId]: { guardando: false, error: '', ok: true } }));
    } catch (error) {
      console.error('Error al guardar usuario:', error);
      setEstadoFila(prev => ({ ...prev, [userId]: { guardando: false, error: 'Error al guardar. Intentá de nuevo.' } }));
    }
  };

  const toggleRolNuevo = (rol) => {
    setNuevoRol(prev => {
      const next = new Set(prev);
      if (next.has(rol)) next.delete(rol);
      else next.add(rol);
      return next;
    });
  };

  const handleAlta = async (e) => {
    e.preventDefault();
    const email = nuevoEmail.trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      setErrorAlta('Formato de email inválido.');
      return;
    }
    if (nuevoRol.size === 0) {
      setErrorAlta('Seleccioná al menos un rol.');
      return;
    }
    if (!nuevaProvincia) {
      setErrorAlta('Seleccioná una provincia.');
      return;
    }
    if (usuarios.some(u => u.id === email)) {
      setErrorAlta('Ya existe un usuario con ese email.');
      return;
    }

    setErrorAlta('');
    setGuardandoAlta(true);
    try {
      const rol = [...nuevoRol];
      await setDoc(doc(db, 'users', email), {
        email,
        rol,
        provincia: nuevaProvincia,
      });

      const nuevoUsuario = { id: email, email, rol, provincia: nuevaProvincia };
      setUsuarios(prev =>
        [...prev, nuevoUsuario].sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id))
      );
      setEdiciones(prev => ({
        ...prev,
        [email]: { rol: new Set(rol), provincia: nuevaProvincia },
      }));

      setNuevoEmail('');
      setNuevoRol(new Set(['usuario_normal']));
      setNuevaProvincia('');
    } catch (error) {
      console.error('Error al crear usuario:', error);
      setErrorAlta('Error al guardar. Intentá de nuevo.');
    } finally {
      setGuardandoAlta(false);
    }
  };

  if (loading) return <div className="p-4">Cargando usuarios...</div>;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Usuarios existentes</h2>
        <div className="space-y-3">
          {usuarios.map(usuario => {
            const edicion = ediciones[usuario.id] || { rol: new Set(), provincia: '' };
            const estado = estadoFila[usuario.id] || {};
            return (
              <div key={usuario.id} className="border rounded-lg p-4 space-y-3">
                <div className="font-semibold text-gray-800">{usuario.email || usuario.id}</div>

                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex gap-3">
                    {ROLES_DISPONIBLES.map(rol => (
                      <label key={rol} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={edicion.rol.has(rol)}
                          onChange={() => toggleRolEdicion(usuario.id, rol)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        {rol}
                      </label>
                    ))}
                  </div>

                  <select
                    value={edicion.provincia}
                    onChange={e => cambiarProvinciaEdicion(usuario.id, e.target.value)}
                    className="border rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">Sin provincia</option>
                    {provinciaOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  <Button
                    type="button"
                    onClick={() => guardarUsuario(usuario.id)}
                    disabled={estado.guardando}
                  >
                    {estado.guardando ? 'Guardando...' : 'Guardar'}
                  </Button>

                  {estado.error && <span className="text-xs text-red-600">{estado.error}</span>}
                  {estado.ok && !estado.error && <span className="text-xs text-green-700">Guardado.</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Dar de alta un usuario nuevo</h2>
        <form onSubmit={handleAlta} className="space-y-4 max-w-lg">
          <div>
            <label htmlFor="nuevo_email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <Input
              id="nuevo_email"
              type="email"
              value={nuevoEmail}
              onChange={e => { setNuevoEmail(e.target.value); setErrorAlta(''); }}
              placeholder="nuevo@usuario.com"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Rol</span>
            <div className="flex gap-4">
              {ROLES_DISPONIBLES.map(rol => (
                <label key={rol} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={nuevoRol.has(rol)}
                    onChange={() => toggleRolNuevo(rol)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  {rol}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="nueva_provincia" className="block text-sm font-medium text-gray-700 mb-1">
              Provincia
            </label>
            <select
              id="nueva_provincia"
              value={nuevaProvincia}
              onChange={e => setNuevaProvincia(e.target.value)}
              className="w-full border px-3 py-2 rounded text-sm"
            >
              <option value="">Seleccionar Provincia</option>
              {provinciaOptions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {errorAlta && <p className="text-sm text-red-600">{errorAlta}</p>}

          <Button type="submit" disabled={guardandoAlta}>
            {guardandoAlta ? 'Guardando...' : 'Crear Usuario'}
          </Button>
        </form>
      </section>
    </div>
  );
}

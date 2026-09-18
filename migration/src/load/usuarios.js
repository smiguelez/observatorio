import { extractUsuarios } from '../extract/usuarios.js';
import { transformUsuario } from '../transform/usuarios.js';
import { buildNameIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

// T027/T028 (US4, prerrequisito de organismos.propietario_id en US2): carga
// usuarios + usuario_roles (FR-004/005/006/007).
export async function loadUsuarios(client) {
  const registros = await extractUsuarios();
  const provincias = await buildNameIdMap(client, 'provincias');
  const roles = await buildNameIdMap(client, 'roles');

  let insertados = 0;
  let rolesInsertados = 0;
  for (const registro of registros) {
    const u = transformUsuario(registro);
    const provinciaId = u.provincia_nombre ? provincias.get(u.provincia_nombre) : null;
    if (u.provincia_nombre && provinciaId === undefined) {
      throw new Error(`usuarios: provincia desconocida "${u.provincia_nombre}" (${u.firestore_id})`);
    }

    const { rows } = await client.query(
      `INSERT INTO usuarios
         (email, nombre_display, email_verificado, foto_url, provincia_id,
          creado_a, ultimo_ingreso_a, creado_a_google, firestore_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        u.email, u.nombre_display, u.email_verificado, u.foto_url, provinciaId ?? null,
        u.creado_a, u.ultimo_ingreso_a, u.creado_a_google, u.firestore_id,
      ],
    );
    insertados++;
    const usuarioId = rows[0].id;

    for (const rolNombre of u.roles) {
      const rolId = roles.get(rolNombre);
      if (rolId === undefined) {
        throw new Error(`usuario_roles: rol desconocido "${rolNombre}" (${u.firestore_id})`);
      }
      await client.query(
        'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [usuarioId, rolId],
      );
      rolesInsertados++;
    }
  }

  await reconcileEntity(client, 'usuarios', registros.length, insertados);
  // usuario_roles no viene de una colección propia (se deriva del array `rol`
  // de cada doc de `users`): el "origen" es la cantidad de asignaciones de rol
  // presentes en los documentos ya extraídos, no una colección aparte.
  const rolesEsperados = registros.reduce(
    (acc, r) => acc + (Array.isArray(r.data.rol) ? r.data.rol.length : 0), 0,
  );
  await reconcileEntity(client, 'usuario_roles', rolesEsperados, rolesInsertados);

  return { usuarios: insertados, usuario_roles: rolesInsertados };
}

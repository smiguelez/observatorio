import { Navigate, type RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from '@/auth/guards'
import AppLayout from '@/components/layout/AppLayout'
import NoAutorizado from '@/routes/errores/NoAutorizado'
import NoEncontrado from '@/routes/errores/NoEncontrado'
import LoginPage from '@/routes/login/LoginPage'
import DatosTab from '@/routes/organismos/DatosTab'
import OrganismoDetallePage from '@/routes/organismos/OrganismoDetallePage'
import OrganismoNuevoPage from '@/routes/organismos/OrganismoNuevoPage'
import OrganismosListPage from '@/routes/organismos/OrganismosListPage'
import TaxonomiaTab from '@/routes/organismos/TaxonomiaTab'
import UnidadesTab from '@/routes/organismos/UnidadesTab'
import UnidadFormPage from '@/routes/organismos/UnidadFormPage'
import AjustesPage from '@/routes/ajustes/AjustesPage'
import PerfilPage from '@/routes/perfil/PerfilPage'
import AdminOrganismosPage from '@/routes/admin/AdminOrganismosPage'
import EditoresTab from '@/routes/organismos/EditoresTab'
import AdminUsuariosPage from '@/routes/admin/AdminUsuariosPage'

// Tabla de rutas = contracts/routes.md. NO existen /pools, /registro ni /signup
// (decisiones 4 y 5): esas URL caen en el comodín `*` (404).
export const rutas: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/organismos" replace /> },
          { path: '/organismos', element: <OrganismosListPage /> },
          { path: '/organismos/nuevo', element: <OrganismoNuevoPage /> },
          {
            path: '/organismos/:id',
            element: <OrganismoDetallePage />,
            children: [
              { index: true, element: <DatosTab /> },
              { path: 'unidades-funcionales', element: <UnidadesTab /> },
              { path: 'unidades-funcionales/nueva', element: <UnidadFormPage /> },
              { path: 'unidades-funcionales/:ufId', element: <UnidadFormPage /> },
              { path: 'taxonomia', element: <TaxonomiaTab /> },
              { path: 'editores', element: <EditoresTab /> },
            ],
          },
          { path: '/perfil', element: <PerfilPage /> },
          { path: '/ajustes', element: <AjustesPage /> },
          { path: '/no-autorizado', element: <NoAutorizado /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/admin/organismos', element: <AdminOrganismosPage /> },
              { path: '/admin/usuarios', element: <AdminUsuariosPage /> },
            ],
          },
          { path: '*', element: <NoEncontrado /> },
        ],
      },
    ],
  },
]

import { Navigate, type RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from '@/auth/guards'
import AppLayout from '@/components/layout/AppLayout'
import NoAutorizado from '@/routes/errores/NoAutorizado'
import NoEncontrado from '@/routes/errores/NoEncontrado'
import LoginPage from '@/routes/login/LoginPage'
import Provisoria from '@/routes/Provisoria'

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
          { path: '/organismos', element: <Provisoria titulo="Mis organismos" /> },
          { path: '/organismos/nuevo', element: <Provisoria titulo="Nuevo organismo" /> },
          { path: '/organismos/:id', element: <Provisoria titulo="Organismo" /> },
          { path: '/organismos/:id/unidades-funcionales/nueva', element: <Provisoria titulo="Nueva unidad funcional" /> },
          { path: '/organismos/:id/unidades-funcionales/:ufId', element: <Provisoria titulo="Unidad funcional" /> },
          { path: '/organismos/:id/taxonomia', element: <Provisoria titulo="Taxonomía" /> },
          { path: '/organismos/:id/editores', element: <Provisoria titulo="Editores" /> },
          { path: '/perfil', element: <Provisoria titulo="Perfil" /> },
          { path: '/ajustes', element: <Provisoria titulo="Ajustes" /> },
          { path: '/no-autorizado', element: <NoAutorizado /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/admin/organismos', element: <Provisoria titulo="Gestión de organismos" /> },
              { path: '/admin/usuarios', element: <Provisoria titulo="Usuarios" /> },
            ],
          },
          { path: '*', element: <NoEncontrado /> },
        ],
      },
    ],
  },
]

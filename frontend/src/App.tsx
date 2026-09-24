import { createBrowserRouter, RouterProvider } from 'react-router'
import { rutas } from './routes'

const router = createBrowserRouter(rutas)

export default function App() {
  return <RouterProvider router={router} />
}

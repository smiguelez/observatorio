import { Outlet } from 'react-router'

// Layout provisorio (T019). La jerarquía de menús completa es US5 (T062–T066).
export default function AppLayout() {
  return (
    <div className="min-h-svh">
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}

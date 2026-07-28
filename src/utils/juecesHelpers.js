export function resolverJueces(uf, poolsMap) {
  if (uf.pool_jueces_id) {
    const cant = poolsMap?.get(uf.pool_jueces_id);
    return cant != null ? `${cant} (pool)` : '(pool)';
  }
  return uf.jueces_asistidos != null && uf.jueces_asistidos !== ''
    ? String(uf.jueces_asistidos)
    : '—';
}

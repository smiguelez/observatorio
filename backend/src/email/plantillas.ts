// 010 (US1/US2): las dos plantillas de email de esta feature. Sin lógica de negocio acá — solo
// arman `{ subject, html }` a partir de un enlace ya construido por el llamador. Nunca reciben el
// token crudo: siempre el `url` completo, listo para poner en un link (research.md, Decisión 2 —
// lo que sí puede aparecer en un log es el motivo de un fallo, nunca el contenido de estas
// plantillas).

export interface EmailArmado {
  subject: string
  html: string
}

export function plantillaMagicLink({ url }: { url: string }): EmailArmado {
  return {
    subject: 'Ingresá al Observatorio de Oficinas Judiciales',
    html: `
      <p>Pediste ingresar al Observatorio de Oficinas Judiciales con un enlace.</p>
      <p><a href="${url}">Hacé clic acá para ingresar</a>.</p>
      <p>El enlace vence en pocos minutos y sirve una sola vez. Si no pediste este ingreso, podés ignorar este mensaje.</p>
    `.trim(),
  }
}

export function plantillaAccesoInicial({ url }: { url: string }): EmailArmado {
  return {
    subject: 'Tu acceso al Observatorio de Oficinas Judiciales',
    html: `
      <p>Un administrador te dio de alta en el Observatorio de Oficinas Judiciales.</p>
      <p><a href="${url}">Hacé clic acá para elegir tu contraseña y entrar</a>.</p>
      <p>El enlace vence y sirve una sola vez. Si no esperabas este correo, podés ignorarlo.</p>
    `.trim(),
  }
}

# Podogest — Frontend (React, desplegado en Vercel)

## Diseño
Quiero un rediseño premium del panel: propón una dirección estética nueva
  (paleta, tipografía, espaciado, sombras, microinteracciones) acorde a una
  clínica de salud: limpia, confiable y profesional, no recargada.
- Antes de escribir código, preséntame la dirección de diseño en pocas líneas
  y espera mi OK. Aplica los cambios por etapas, componente por componente.
- Centraliza colores y tamaños como variables CSS en :root para mantener consistencia.
- No cambies la lógica, los fetch ni el comportamiento: solo la capa visual.
- Mantén la accesibilidad (contraste suficiente, foco visible) y que funcione en móvil.

## Reglas técnicas
- No envíes la cabecera Accept con MIME de archivo en descargas (provoca 406 en DRF).
  Asigna el MIME al Blob y lee el nombre desde Content-Disposition.
- Este entorno no conoce el backend: si un cambio necesita un endpoint o campo nuevo,
  dímelo explícitamente en vez de suponerlo.
- Commits: feat/fix/refactor(frontend): mensaje
- Ejecuta lint y build directamente, sin subagentes.
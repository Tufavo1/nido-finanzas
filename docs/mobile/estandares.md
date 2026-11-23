<!-- Copyright (c) 2026 Dinovance -->
# Estándares obligatorios por rol (indicados por el dueño, 2026-11-21)

Complementan `requisitos.md` y `decisiones.md`. Cada agente los cumple y QA escribe pruebas de lo que sea comprobable. Lo que no se pueda verificar automáticamente se marca "NO VERIFICADO".

## Front-end (diseño y experiencia)
- **Skeletons** de carga en todas las listas, tarjetas y gráficos (nunca una pantalla en blanco ni un spinner suelto). Respetan modo oscuro y "reducir movimiento".
- **Toasts / snackbars** con sistema único: éxito, error, aviso e información; con acción ("Deshacer", "Reintentar"), cola, duración razonable y lectura por lector de pantalla (`role=status`/`alert`).
- **Pantallas de error y de estado** diseñadas, en español simple, con una acción clara: sin conexión, servidor no disponible, sesión caducada, sin permiso, no encontrado (404), mantenimiento, error inesperado (con límite de errores / error boundary), permiso de notificaciones pendiente o revocado, y estados vacíos con una guía de primer paso.
- **Copyright y créditos:** pie "© 2026 Dinovance" y pantalla "Acerca de" con versión, licencias de terceros (generada del inventario de dependencias) y política de privacidad.
- **Patrones modernos:** tokens de diseño (colores, espaciado, tipografía, radios), componentes reutilizables y consistentes, hojas inferiores (bottom sheets), actualizar al deslizar, UI optimista con reversa, háptica en acciones clave, animaciones sutiles, áreas táctiles de al menos 48 dp, contraste AA, navegación atrás de Android, safe areas, teclado sin tapar campos, enlaces profundos.
- Código del front limpio: componentes pequeños, sin lógica de negocio en la vista (va en `lib/`), sin duplicación.

## Backend / Android nativo (lógica, errores y calidad)
- **Taxonomía de errores explícita y tipada** (por ejemplo: sin conexión, tiempo agotado, no autorizado, sesión caducada, prohibido, no encontrado, conflicto/duplicado, validación, límite de peticiones, servidor, desconocido), con mapeo desde HTTP/Supabase/Postgres (incluido 23505) a un mensaje de usuario en español y a una acción sugerida. Sin `catch` vacíos; nada de tragar excepciones.
- **Lógica de negocio** en módulos puros y testeables, con reglas documentadas (montos enteros en CLP, un hogar máximo 2 personas, privacidad de sueldo/ingresos, fechas válidas, deduplicación, modo automático con límites).
- **Manejo de errores y resiliencia:** reintentos con retroceso exponencial y tope, idempotencia, cola sin conexión, tiempos de espera, cancelación, que el servicio de notificaciones nunca se caiga por un aviso malformado, y registros SIN datos personales ni montos.
- **Validación de entradas** en cada frontera (aviso de notificación, enlace profundo, respuesta de red).
- **Código limpio y buenas prácticas:** SOLID, funciones cortas y con un propósito, nombres claros, sin números mágicos, sin código muerto, comentarios solo del "por qué", linter y formateo (oxlint/tsc estricto; ktlint o detekt en Kotlin si se puede), cobertura de pruebas de la lógica, dependencias con versión fija y mínimas.
- Funcionalidad completa del requisito, no solo el camino feliz.

## Seguridad (usuario, credenciales, identidad, datos y conectividad)
- **Credenciales:** sesión y tokens solo en almacenamiento seguro (Keystore); nunca en logs, en el APK, en el repo, en `localStorage` ni en el portapapeles; contraseñas nunca almacenadas; cierre de sesión que borra todo; bloqueo con biometría/PIN; rotación y revocación; `service_role` nunca en el cliente.
- **Anti robo de identidad:** MFA, límites de intentos, detección de inicio de sesión desde dispositivo o ubicación nueva con aviso al usuario, cierre de otras sesiones, protección contra enumeración de cuentas, fijación de certificado o al menos TLS estricto, sin tráfico en claro (`usesCleartextTraffic=false`), `allowBackup=false` o respaldo excluido, protección contra capturas de pantalla en pantallas sensibles, ocultar montos en recientes y en pantalla de bloqueo.
- **Datos y conectividad:** minimización (el texto bruto de notificaciones nunca sale del teléfono), cifrado en reposo local, validación de certificados, tiempos de espera, comportamiento seguro sin red.
- **Evitar código copiado o plagio:** inventario de dependencias con su licencia (SBOM), rechazo de licencias incompatibles, sin fragmentos copiados sin atribución, encabezados de copyright/licencia y archivo de avisos de terceros; revisión de que no se hayan incluido paquetes dudosos (typosquatting) ni secretos.
- **Panel de administración de seguridad** (se extiende el panel de administración que ya existe): el administrador ve qué ocurre y qué va mal. Mínimo: intentos de inicio de sesión fallidos y bloqueados (límites de tasa), inicios en dispositivos nuevos, intentos de MFA fallidos, cambios de contraseña/correo/rol, cuentas borradas, errores 401/403 anómalos, picos de peticiones, permisos del servicio de notificaciones revocados, estado de salud (base, auth, gateway, cola de push), y **alertas** con severidad cuando hay indicios de ataque (fuerza bruta, relleno de credenciales, acceso desde varios lugares a la vez, escalada de privilegios). Los datos viven en una tabla de eventos de seguridad con RLS (solo administradores con aal2 pueden leer; nadie puede editar ni borrar), alimentada por el servidor, sin guardar contraseñas ni textos sensibles. Cambios de esquema solo como migración nueva probada en la base local de staging.
- **Límite honesto, a documentar:** el panel muestra indicios y alertas; no puede garantizar detectar todo ataque. Debe decirlo en su documentación y decir qué NO cubre.
- Entrega: el informe de seguridad (documento privado, fuera del repositorio) con amenazas (modelo de amenazas), controles, hallazgos con gravedad y evidencia real.

## iOS
Mismos estándares donde aplique (Keychain en lugar de Keystore, sin acceso a notificaciones de otras apps). Todo lo no compilable en este equipo se marca "NO PROBADO".

## QA (TDD)
Escribe pruebas, primero en rojo, de: mapeo de errores, cola de toasts, estados de error de la UI (componentes), enlace profundo, validación de entradas, reglas de negocio, eventos de seguridad (clasificación de gravedad y alertas), inventario de licencias y copyright, y que no haya secretos ni `console.log` con datos en el código.

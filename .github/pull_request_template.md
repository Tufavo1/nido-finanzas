## Qué cambia y por qué

## Checklist de cambio (ISO 27001 · control 8.32)
- [ ] `npx tsc -b`, `npm run lint` y `npm test` pasan (lo comprueba CI)
- [ ] Si toca la base de datos: migración nueva + prueba en `supabase/tests`
- [ ] Si toca autenticación, permisos, Worker o cabeceras: revisé el impacto en seguridad y privacidad
- [ ] No hay secretos, respaldos ni datos reales en el cambio
- [ ] Si cambia lo que se pide o se guarda de las personas: actualicé la política de privacidad
- [ ] Plan de vuelta atrás (cómo revertir si falla)

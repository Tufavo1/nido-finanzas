<!-- Copyright (c) 2026 Dinovance -->
# Verificar el aviso de Billetera Google (con MacroDroid)

La lectura de Billetera Google está hecha con avisos **inventados** a partir de un ejemplo visto en pantalla («Shell Vespucio 1828 F1  23 nov  CLP 20,000»). Para ajustarla con datos reales hace falta anotar cómo llega el aviso de verdad. Toma 5 minutos y una compra pequeña.

## Qué preparar
1. En MacroDroid: **Disparador** «Notificación recibida» → aplicación: Billetera de Google (y, si no ves nada, prueba también con «Servicios de Google Play»). **Acción** «Escribir en archivo» o «Registrar en el log del sistema» con `[notification_title]`, `[notification]` (texto), `[notification_app_package]` y la hora `[hour]:[minute]:[second]`.
2. Paga algo pequeño con el teléfono (sin contacto) con una tarjeta que **también** te avise por la app del banco.

## Qué anotar (una fila por aviso)
| Dato | Ejemplo |
|---|---|
| Paquete que avisó | `com.google.android.apps.walletnfcrel` (¿o `com.google.android.gms`?) |
| Título (tal cual) | `Shell Vespucio 1828 F1` |
| Texto (tal cual) | `23 nov · CLP 20,000 · Visa ••1234` |
| Hora del aviso de Wallet y hora del aviso del banco | `13:02:10` / `13:02:45` (para saber cuánto se separan) |
| ¿Llegó dos veces el de Wallet? (igual o actualizado) | sí / no |
| ¿El aviso se queda fijo en la barra o se puede deslizar? | se desliza |

Si es posible, anota también un aviso de Wallet que **no** sea compra (tarjeta agregada, promoción, pase) y uno de **reembolso**.

## Cómo pegar una muestra sin exponer datos
Antes de mandarla, reemplaza:
- cada dígito del monto y de la tarjeta por `#` (deja la coma o el punto: `CLP ##,###`, `Visa ••####`), pero **no** cambies el formato (si dice `CLP`, coma o punto, déjalo igual);
- el nombre del comercio por algo del mismo largo y forma (`Shell Vespucio 1828 F1` → `Xxxxx Xxxxxxxx #### X#`), conservando si tiene números o código de local;
- la fecha puede quedar como viene (`23 nov`).

Ejemplo de muestra lista para pegar:
```
paquete: com.google.android.apps.walletnfcrel
titulo:  Xxxxx Xxxxxxxx #### X#
texto:   ## nov · CLP ##,### · Visa ••####
hora wallet 13:02:10 · hora banco 13:02:45 · llegó dos veces: no
```

También sirve el diagnóstico de la app («Avisos que no pude leer» → Copiar): ya viene enmascarado.

## Qué se ajusta con esto
El paquete (si avisa Play services hay que tratarlo distinto), qué va en el título y en el texto, el formato del monto, las palabras de los avisos que no son compras, y la ventana de 10 minutos entre el aviso del banco y el de Wallet.

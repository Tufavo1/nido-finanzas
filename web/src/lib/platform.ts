// Copyright (c) 2026 Dinovance
import { Capacitor } from '@capacitor/core'

/** ¿Corre dentro de la app nativa (Android o iOS)? En el navegador y la PWA es false. */
export const isNative = (): boolean => Capacitor.isNativePlatform()

/** 'android', 'ios' o 'web' */
export const platform = (): string => Capacitor.getPlatform()

/** Texto sin las marcas **negrita**, para avisos del sistema y etiquetas de accesibilidad */
export const plain = (text: string): string => text.replaceAll('**', '')

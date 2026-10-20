# Impresora térmica (comandera) para los tickets de venta

Stockea imprime un **ticket de venta** (no fiscal) en cualquier impresora térmica de **58 u 80 mm**
que tenga driver para la computadora. Sirve también **sin conexión**: el ticket se arma en el navegador.

> Probado como referencia: **Xprinter XP-E200M** (80 mm, USB, corte automático). Usar rollos de **80 mm**
> (80×70 u 80×80): con rollos de 58 mm esa impresora se desalinea.

## 1. Instalar la impresora (Windows)

1. Conectar la impresora por USB y prenderla.
2. Instalar el **driver** que viene con la impresora (CD/pendrive) o descargarlo de la página del fabricante.
   Para Xprinter: el instalador "Xprinter Driver" → elegir el modelo (ej. *XP-80*) y el puerto USB que detecta.
3. En **Configuración → Impresoras**, abrir la impresora → *Preferencias de impresión*:
   - Tamaño de papel: **80 × 297 mm** o el de "rollo/receipt" que ofrezca el driver (en 58 mm, el de 58).
   - Si el driver tiene opciones de **corte** ("Cut paper" / "Paper cut"), dejar **cortar al final del documento**.
4. Imprimir una **página de prueba** desde Windows para confirmar que anda.
5. Marcarla como **impresora predeterminada** (clic derecho → *Establecer como predeterminada*). En Windows 10/11
   desactivar antes *"Permitir que Windows administre la impresora predeterminada"*.

## 2. Configurar Stockea (en esa computadora)

En **Ventas → ⚙ (al lado de "Último ticket")**:

- **Ancho del papel:** 80 mm o 58 mm.
- **Imprimir al confirmar la venta:** si está activado, el ticket sale solo cada vez que se confirma una venta.
  Si no, se imprime desde el botón **"Ticket"** del aviso de la venta o desde **"Último ticket"**.
- **Texto al pie:** por ejemplo "¡Gracias por su compra!" o el Instagram del negocio.
- **Imprimir prueba** para ver cómo sale.

La configuración queda guardada **en esa computadora** (cada caja tiene su impresora). Si se borran los datos del
navegador, hay que volver a configurarla.

La primera vez que se imprime desde Chrome, en el cuadro de impresión elegir la térmica, **Márgenes: Ninguno** y
destildar *Encabezados y pies de página*. Chrome recuerda esas opciones.

## 3. Imprimir sin que aparezca el cuadro de impresión (recomendado)

Chrome puede imprimir directo en la impresora predeterminada con la opción `--kiosk-printing`:

1. Clic derecho en el acceso directo de Chrome del escritorio → **Propiedades**.
2. En **Destino**, agregar al final (después de las comillas) un espacio y `--kiosk-printing`. Ejemplo:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing
   ```

3. **Cerrar todas las ventanas de Chrome** (también el ícono de la barra de tareas) y abrirlo desde ese acceso directo.

Desde ese momento el ticket sale sin preguntar. Si se instaló Stockea como aplicación (PWA), agregar el mismo
`--kiosk-printing` en el acceso directo de la aplicación.

## 4. Reimprimir

- **Última venta:** botón **"Último ticket"** en Nueva venta.
- **Cualquier venta:** botón de la impresora 🖨 en el **Historial de ventas** o **"Ticket"** en el detalle de la venta.
  Sale marcado como *REIMPRESIÓN*. (El "paga con / vuelto" no se guarda, así que no aparece al reimprimir.)

## Problemas comunes

| Problema | Solución |
|---|---|
| Sale una hoja larga en blanco | Elegir márgenes "Ninguno" en el cuadro de Chrome y el tamaño de papel de rollo en el driver. |
| Sale el ticket cortado a los costados | Revisar que el ancho en Stockea coincida con el rollo (58 u 80). |
| Sale con la fecha y la URL arriba/abajo | Destildar *Encabezados y pies de página* en el cuadro de impresión. |
| No imprime nada con `--kiosk-printing` | La térmica no es la impresora predeterminada, o Chrome no se cerró del todo antes de abrirlo con la opción. |
| Las letras salen muy claras | Subir la *densidad / darkness* en las preferencias del driver. |
| Ticket "Venta pendiente" | La venta se hizo sin conexión: el número se asigna cuando se sube. Se puede reimprimir con número desde el historial. |

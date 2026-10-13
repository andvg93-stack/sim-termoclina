# Laboratorio de termoclina

Simulador educativo de estratificación de un lago. Permite explorar temperatura, oxígeno disuelto, nutrientes y estabilidad, ajustar las condiciones ambientales y comparar con un escenario base.

## Ejecutar

Requiere Node.js. La aplicación es estática y no necesita compilación ni una cuenta externa.

```sh
npm ci
npm start
```

Abre `http://127.0.0.1:8765`. También se puede publicar la raíz del repositorio en un servidor estático que sirva módulos JavaScript e imágenes PNG. No abrir `index.html` mediante `file://`.

## Explorar

- Selecciona un escenario; usa **Pausar / Continuar**, **Reiniciar** y la velocidad para controlar el tiempo.
- Ajusta clima, características del lago, calidad del agua, tiempo y visualización. Las opciones adicionales del lago están en **Más opciones**.
- Elige el color del agua. La leyenda usa la misma escala que las capas; sus extremos saturan los valores fuera del rango indicado.
- Haz clic o toca una profundidad para consultar temperatura, oxígeno, nutrientes, pH, conductividad y turbidez. Con el lago enfocado, usa ↑, ↓, Inicio, Fin y Escape.
- Las pestañas ofrecen perfiles, evolución con escalas independientes, comparación y explicación. El modo guiado añade instrucciones por escenario.
- En móvil, **Ajustar** abre los parámetros debajo del lago. Las pestañas permanecen accesibles en la parte inferior.
- **Exportar datos** descarga el estado actual en JSON. **Guía** describe los controles. El icono de ampliar o la tecla F activa la pantalla completa.

El modelo físico y las condiciones numéricas de los escenarios se conservan. Se trata de relaciones educativas simplificadas, no de un modelo hidrodinámico ni de datos medidos. El paisaje es ilustrativo; el agua, los perfiles y los indicadores se calculan en tiempo real.

## Verificación de interfaz

```sh
npx playwright install chromium
npm run test:visual
```

La prueba arranca un servidor local temporal, revisa los seis escenarios, controles, comparación, navegación, exportación, accesibilidad básica, tacto, pantalla completa y seis anchos de pantalla (320–1512 px). Guarda capturas y un resumen en `output/visual-review/`, incluyendo los fallos si ocurren. Cierra el servidor y el navegador al terminar.

Para usar Chrome instalado o cambiar el destino de las capturas, define `BROWSER_EXECUTABLE` y `ARTIFACT_DIR`. Ejemplo en PowerShell:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:ARTIFACT_DIR = 'output/visual-review'
npm run test:visual
```

## Diseño

La interfaz sigue el arte conceptual aprobado: fondo claro, azul profundo, controles turquesa, cuatro indicadores, paisaje panorámico y tres perfiles. Los datos reales pueden diferir de los valores ilustrativos del concepto.

El origen y el prompt de la ilustración están documentados en [assets/README.md](assets/README.md).

// Núcleo del efecto estroboscópico.
//
// Modelo: una escena de cámara fija. El primer frame (o uno elegido) es el
// "fondo". Por cada frame muestreado detectamos los píxeles que difieren del
// fondo por encima de un umbral (el sujeto en movimiento) y los acumulamos en
// una única imagen, dejando al sujeto repetido en todas sus posiciones.

export class Strobe {
  /**
   * @param {HTMLCanvasElement} outputCanvas  canvas visible donde se compone el resultado
   */
  constructor(outputCanvas) {
    this.canvas = outputCanvas;
    this.ctx = outputCanvas.getContext("2d", { willReadFrequently: true });

    // Canvas de trabajo (oculto) donde se dibuja cada frame del vídeo.
    this.work = document.createElement("canvas");
    this.workCtx = this.work.getContext("2d", { willReadFrequently: true });

    this.background = null; // ImageData del fondo
    this.accumulator = null; // ImageData que se va componiendo

    // Parámetros ajustables desde la UI.
    this.threshold = 30;
    this.highlight = false; // si true, el sujeto se pinta de un color sólido
    this.color = { r: 255, g: 0, b: 0 };
  }

  /** Ajusta los canvas a la resolución del vídeo. Llamar al cargar metadata. */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.work.width = width;
    this.work.height = height;
    this.background = null;
    this.accumulator = null;
  }

  /** ¿Ya tenemos un fondo capturado? */
  get ready() {
    return this.background !== null;
  }

  /**
   * Captura el frame actual del vídeo como fondo y lo pinta como base del
   * resultado. Reinicia cualquier acumulación previa.
   */
  captureBackground(video) {
    this.workCtx.drawImage(video, 0, 0, this.work.width, this.work.height);
    this.background = this.workCtx.getImageData(
      0,
      0,
      this.work.width,
      this.work.height
    );
    // El acumulador parte de una copia del fondo.
    this.accumulator = new ImageData(
      new Uint8ClampedArray(this.background.data),
      this.background.width,
      this.background.height
    );
    this.ctx.putImageData(this.accumulator, 0, 0);
  }

  /**
   * Dibuja el frame actual, detecta el sujeto frente al fondo y lo fusiona en
   * el acumulador. Refresca el canvas visible.
   */
  accumulateFrame(video) {
    if (!this.ready) return;

    this.workCtx.drawImage(video, 0, 0, this.work.width, this.work.height);
    const current = this.workCtx.getImageData(
      0,
      0,
      this.work.width,
      this.work.height
    );

    const cur = current.data;
    const bg = this.background.data;
    const acc = this.accumulator.data;
    const t = this.threshold;
    const { r: hr, g: hg, b: hb } = this.color;

    for (let i = 0; i < cur.length; i += 4) {
      const dr = Math.abs(cur[i] - bg[i]);
      const dg = Math.abs(cur[i + 1] - bg[i + 1]);
      const db = Math.abs(cur[i + 2] - bg[i + 2]);

      // Foreground: difiere del fondo en algún canal por encima del umbral.
      if (dr > t || dg > t || db > t) {
        if (this.highlight) {
          acc[i] = hr;
          acc[i + 1] = hg;
          acc[i + 2] = hb;
        } else {
          acc[i] = cur[i];
          acc[i + 1] = cur[i + 1];
          acc[i + 2] = cur[i + 2];
        }
        acc[i + 3] = 255;
      }
    }

    this.ctx.putImageData(this.accumulator, 0, 0);
  }

  /** Borra la acumulación volviendo al fondo capturado. */
  reset() {
    if (!this.ready) return;
    this.accumulator = new ImageData(
      new Uint8ClampedArray(this.background.data),
      this.background.width,
      this.background.height
    );
    this.ctx.putImageData(this.accumulator, 0, 0);
  }

  /** Resultado actual como data URL PNG. */
  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}

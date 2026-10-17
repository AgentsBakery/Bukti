// Friendly client-side photo check on a downscaled canvas:
// brightness (mean luma), glare (share of blown-out pixels), sharpness (variance of Laplacian).

export type PhotoVerdict = 'ok' | 'dark' | 'bright' | 'blurry'

export interface PhotoQuality {
  verdict: PhotoVerdict
  brightness: number
  glare: number
  sharpness: number
}

export async function checkPhoto(file: Blob): Promise<PhotoQuality> {
  const bmp = await createImageBitmap(file)
  const scale = 360 / Math.max(bmp.width, bmp.height)
  const w = Math.max(8, Math.round(bmp.width * scale))
  const h = Math.max(8, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  let sum = 0
  let blown = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[p] = y
    sum += y
    if (y > 248) blown++
  }
  const brightness = sum / gray.length
  const glare = blown / gray.length
  let lsum = 0
  let lsq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      lsum += l
      lsq += l * l
      n++
    }
  }
  const mean = lsum / n
  const sharpness = lsq / n - mean * mean
  const verdict: PhotoVerdict = brightness < 70 ? 'dark' : glare > 0.25 ? 'bright' : sharpness < 35 ? 'blurry' : 'ok'
  return { verdict, brightness, glare, sharpness }
}

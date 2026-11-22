// Shrinks a photo in the browser before it is uploaded: longest side at most
// MAX_SIDE px, re-encoded as JPEG. Phone cameras give 4000+ px images of several
// MB; the record's photos only need to be readable.
//
// The EXIF orientation is applied while decoding (imageOrientation
// 'from-image'), so the result is upright and carries no orientation tag.
// If anything fails (a format the browser can't decode, such as HEIC in some
// browsers, no canvas, no memory), the original file is returned untouched:
// uploading it is better than losing the photo.

export const MAX_SIDE = 1600
export const JPEG_QUALITY = 0.82

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    if (typeof canvas.convertToBlob === 'function') {
      canvas.convertToBlob({ type, quality }).then(resolve, () => resolve(null))
    } else {
      canvas.toBlob(resolve, type, quality)
    }
  })

const jpegName = (name) => `${(name || 'foto').replace(/\.[^./\\]+$/, '') || 'foto'}.jpg`

export async function compressImage(file, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  if (!(file instanceof Blob) || typeof createImageBitmap !== 'function') return file

  let bitmap = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = bitmap
    if (!width || !height) return file

    const scale = Math.min(1, maxSide / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(targetWidth, targetHeight)
        : Object.assign(document.createElement('canvas'), { width: targetWidth, height: targetHeight })
    const context = canvas.getContext('2d')
    if (!context) return file
    // JPEG has no transparency: a PNG's transparent areas would turn black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (!blob || blob.size === 0) return file
    // Already small and not resized: the original is not worse.
    if (scale === 1 && file.type === 'image/jpeg' && blob.size >= file.size) return file

    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}

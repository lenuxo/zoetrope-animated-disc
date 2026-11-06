import { sourceFrameAtSlot } from './model.ts'
import { geometryError } from './plate.ts'
import type { PlateGeometry } from './plate.ts'

/** Editable construction guide, with frame order matching clockwise playback. */
export function createGuideTemplate(geometry: PlateGeometry) {
  const error = geometryError(geometry)
  if (error) throw new RangeError(error)
  const { slots, frames, repeats } = geometry
  const cells = Array.from({ length: slots }, (_, slot) => {
    const frame = sourceFrameAtSlot(slot, frames) + 1
    const angle = slot * 360 / slots
    return `<g id="position-${slot + 1}" data-frame="${frame}" transform="rotate(${angle} 600 600)">
      <path d="M600 255V90" transform="rotate(${180 / slots} 600 600)" stroke="#94a3b8" stroke-width="1"/>
      <text x="600" y="67" text-anchor="middle" font-family="sans-serif" font-size="${Math.min(16, 1300 / slots)}" fill="#334155">${String(frame).padStart(2, '0')}</text>
      <circle cx="600" cy="170" r="3" fill="#315acb"/>
      <path d="M600 198V182M596 187L600 182L604 187" fill="none" stroke="#315acb" stroke-width="1.5"/>
    </g>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <title>Zoetrope layout guide: ${slots} slots, ${frames} frames, ${repeats} repeats</title>
  <desc>Clockwise playback. Frame numbers increase counterclockwise. Place each frame at its blue anchor with its top facing outward. Hide or remove the guides group before exporting your artwork as PNG.</desc>
  <rect width="1200" height="1200" fill="white"/>
  <g id="guides">
    <circle cx="600" cy="600" r="560" fill="none" stroke="#334155" stroke-width="2"/>
    <circle cx="600" cy="600" r="510" fill="none" stroke="#94a3b8" stroke-dasharray="5 5"/>
    <circle cx="600" cy="600" r="345" fill="none" stroke="#94a3b8" stroke-dasharray="5 5"/>
    <circle cx="600" cy="600" r="430" fill="none" stroke="#cbd5e1" stroke-dasharray="3 6"/>
    ${cells}
    <path d="M580 600H620M600 580V620" stroke="#315acb" stroke-width="1.5"/>
    <text x="600" y="535" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#334155">${slots} slots = ${frames} frames x ${repeats}</text>
    <text x="600" y="660" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#334155">Clockwise playback / top facing outward</text>
    <text x="600" y="690" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#64748b">Hide the guides group before PNG export</text>
  </g>
  <g id="artwork"></g>
</svg>`
}

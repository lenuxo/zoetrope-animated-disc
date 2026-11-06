import test from 'node:test'
import assert from 'node:assert/strict'
import { createGuideTemplate } from '../src/simulation/guide-template.ts'

test('downloadable 54-slot template places clockwise source poses in reverse circular order', () => {
  const svg = createGuideTemplate({ slots: 54, frames: 18, repeats: 3 })
  const sequence = [...svg.matchAll(/data-frame="(\d+)"/g)].map((match) => Number(match[1]))
  assert.equal(sequence.length, 54)
  assert.deepEqual(sequence.slice(0, 4), [1, 18, 17, 16])
  assert.deepEqual(sequence.slice(-3), [4, 3, 2])
  for (let frame = 1; frame <= 18; frame++) assert.equal(sequence.filter((n) => n === frame).length, 3)
  assert.match(svg, /id="guides"/)
  assert.match(svg, /width="1200" height="1200"/)
  assert.match(svg, /cx="600" cy="600" r="560"/)
})

test('alternate viewing combination produces 40 positions and four complete 10-frame loops', () => {
  const svg = createGuideTemplate({ slots: 40, frames: 10, repeats: 4 })
  const sequence = [...svg.matchAll(/data-frame="(\d+)"/g)].map((match) => Number(match[1]))
  assert.equal(sequence.length, 40)
  assert.deepEqual(sequence.slice(0, 3), [1, 10, 9])
  for (let frame = 1; frame <= 10; frame++) assert.equal(sequence.filter((n) => n === frame).length, 4)
})

test('template export rejects incomplete and invalid circular layouts', () => {
  assert.throws(() => createGuideTemplate({ slots: 54, frames: 20, repeats: 3 }), RangeError)
  assert.throws(() => createGuideTemplate({ slots: 0, frames: 0, repeats: 0 }), RangeError)
})

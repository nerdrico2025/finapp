import { describe, it, expect } from 'vitest'
import {
  computeMenuPosition, menuTotalHeight, MAX_LIST_HEIGHT, VIEWPORT_MARGIN, MENU_GAP,
} from './menu-position'

const VP = { width: 1280, height: 800 }
const trigger = (top: number, height = 24, left = 100, width = 110) => ({ top, bottom: top + height, left, width })

/** Retângulo ocupado pelo menu na tela. */
function box(pos: ReturnType<typeof computeMenuPosition>, hasFooter: boolean, vh = VP.height) {
  const h = menuTotalHeight(pos, hasFooter)
  const top = pos.top !== undefined ? pos.top : vh - pos.bottom! - h
  return { top, bottom: top + h }
}

describe('computeMenuPosition', () => {
  it('com bastante espaço embaixo, abre para baixo com a lista inteira', () => {
    const p = computeMenuPosition(trigger(100), VP, { minWidth: 240, hasFooter: true })
    expect(p.top).toBe(124 + MENU_GAP)
    expect(p.maxHeight).toBe(MAX_LIST_HEIGHT)
  })

  it.each([150, 300, 420, 500, 560, 620, 700, 760])(
    'gatilho em y=%i: busca e rodapé sempre dentro da janela',
    (y) => {
      for (const hasFooter of [true, false]) {
        const p = computeMenuPosition(trigger(y), VP, { minWidth: 240, hasFooter })
        const b = box(p, hasFooter)
        expect(b.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
        expect(b.bottom).toBeLessThanOrEqual(VP.height - VIEWPORT_MARGIN)
        expect(p.maxHeight).toBeGreaterThan(0)
      }
    },
  )

  it('caso do bug: 300px livres embaixo — antes o rodapé ficava ~80px fora da tela', () => {
    // gatilho termina em 500 → 300px abaixo
    const p = computeMenuPosition(trigger(476), VP, { minWidth: 240, hasFooter: true })
    expect(box(p, true).bottom).toBeLessThanOrEqual(VP.height - VIEWPORT_MARGIN)
  })

  it('perto do fim da janela, abre para cima', () => {
    const p = computeMenuPosition(trigger(700), VP, { minWidth: 240, hasFooter: true })
    expect(p.bottom).toBe(VP.height - 700 + MENU_GAP)
    expect(p.top).toBeUndefined()
  })

  it('janela muito baixa: ocupa a janela, sem cortar busca nem rodapé', () => {
    const vp = { width: 800, height: 160 }
    const p = computeMenuPosition(trigger(60), vp, { minWidth: 240, hasFooter: true })
    const b = box(p, true, vp.height)
    expect(b.top).toBe(VIEWPORT_MARGIN)
    expect(b.bottom).toBeLessThanOrEqual(vp.height - VIEWPORT_MARGIN)
  })

  it('largura mínima e sem vazar à direita', () => {
    const p = computeMenuPosition(trigger(100, 24, 1200, 60), VP, { minWidth: 240, hasFooter: false })
    expect(p.width).toBe(240)
    expect(p.left + p.width).toBeLessThanOrEqual(VP.width - VIEWPORT_MARGIN)
  })
})

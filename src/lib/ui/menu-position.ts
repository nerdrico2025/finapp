/**
 * Posição do menu flutuante (position: fixed) do CategorySelect.
 *
 * O menu tem três partes: busca (fixa, em cima), área rolável (lista ou
 * formulário de nova categoria) e, opcionalmente, rodapé fixo ("Nova
 * categoria"). Só a área rolável encolhe; busca e rodapé têm altura fixa e
 * precisam caber inteiros na tela — antes, o maxHeight limitava só a lista e
 * o rodapé podia ficar abaixo da borda da janela.
 */

/** Alturas fixas em px (inclui bordas): busca p-2 + campo py-1.5; rodapé py-2.5 + border-t. */
export const MENU_SEARCH_HEIGHT = 49
export const MENU_FOOTER_HEIGHT = 41
/** Borda de 1px em cima e embaixo do próprio menu. */
export const MENU_BORDER = 2
/** Distância entre o gatilho e o menu. */
export const MENU_GAP = 4
/** Margem mínima até a borda da janela. */
export const VIEWPORT_MARGIN = 8
/** Altura máxima da área rolável. */
export const MAX_LIST_HEIGHT = 320
/** Abaixo disso a área rolável fica pequena demais e vale abrir do outro lado. */
export const MIN_COMFORT_LIST_HEIGHT = 160

export interface TriggerRect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface MenuPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  /** maxHeight da área rolável (lista ou formulário). */
  maxHeight: number
}

export function computeMenuPosition(
  trigger: TriggerRect,
  viewport: { width: number; height: number },
  opts: { minWidth: number; hasFooter: boolean },
): MenuPosition {
  const chrome = MENU_BORDER + MENU_SEARCH_HEIGHT + (opts.hasFooter ? MENU_FOOTER_HEIGHT : 0)
  const spaceBelow = viewport.height - trigger.bottom - MENU_GAP - VIEWPORT_MARGIN
  const spaceAbove = trigger.top - MENU_GAP - VIEWPORT_MARGIN

  const fitsBelow = spaceBelow - chrome >= Math.min(MAX_LIST_HEIGHT, MIN_COMFORT_LIST_HEIGHT)
  const openUp = !fitsBelow && spaceAbove > spaceBelow
  const available = openUp ? spaceAbove : spaceBelow

  const width = Math.max(trigger.width, opts.minWidth)
  const left = Math.min(trigger.left, Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN))

  // Nem a busca + rodapé cabem do lado escolhido (janela muito baixa): o menu
  // ocupa a janela inteira, por cima do gatilho, para que nada fique de fora.
  if (available < chrome) {
    return {
      top: VIEWPORT_MARGIN,
      left,
      width,
      maxHeight: Math.max(0, Math.min(MAX_LIST_HEIGHT, viewport.height - 2 * VIEWPORT_MARGIN - chrome)),
    }
  }

  const maxHeight = Math.min(MAX_LIST_HEIGHT, available - chrome)
  return openUp
    ? { bottom: viewport.height - trigger.top + MENU_GAP, left, width, maxHeight }
    : { top: trigger.bottom + MENU_GAP, left, width, maxHeight }
}

/** Altura total que o menu ocupa com essa posição (para testes e conferência). */
export function menuTotalHeight(pos: MenuPosition, hasFooter: boolean): number {
  return MENU_BORDER + MENU_SEARCH_HEIGHT + pos.maxHeight + (hasFooter ? MENU_FOOTER_HEIGHT : 0)
}

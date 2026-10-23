import assert from 'node:assert/strict'

// A page can fit the viewport while its tables still require horizontal scrolling.
export async function assertMobileTables(page) {
  if (page.viewportSize().width > 700) return
  const clippedActions = await page
    .locator('dialog[open] .modal-fixed-footer')
    .evaluateAll((footers) =>
      footers.flatMap((footer) => {
        const dialog = footer.closest('dialog').getBoundingClientRect()
        return [...footer.querySelectorAll('button')]
          .filter((button) => {
            const rect = button.getBoundingClientRect()
            return rect.top < dialog.top || rect.bottom > dialog.bottom - 1
          })
          .map((button) => button.textContent.trim())
      }),
    )
  assert.deepEqual(
    clippedActions,
    [],
    'Las acciones deben quedar completas dentro de la ventana móvil',
  )
  const clipped = await page.locator('.ops-table, .picking-table').evaluateAll((tables) =>
    tables
      .filter((table) => table.getClientRects().length)
      .flatMap((table) => {
        const region = table.closest('.ops-table-wrap, .picking-table-wrap')
        return region && region.scrollWidth > region.clientWidth + 1
          ? [region.getAttribute('aria-label') || table.className]
          : []
      }),
  )
  assert.deepEqual(
    clipped,
    [],
    'Las fichas móviles deben mostrar todos los datos sin scroll lateral',
  )
}

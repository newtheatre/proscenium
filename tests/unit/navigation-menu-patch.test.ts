import { describe, expect, test } from 'bun:test'

// The contract of patches/@nuxt%2Fui@4.11.0.patch (0118): a console group with no link of its own is
// one trigger, so its chevron is a plain span carrying no aria-expanded (axe aria-allowed-attr).
const MENU = 'node_modules/@nuxt/ui/dist/runtime/components/NavigationMenu.vue'

describe('the sidebar group chevron is not a second accordion trigger', () => {
  test('the trailing chevron is a trigger only for a group that is also a link', async () => {
    const source = await Bun.file(MENU).text()
    expect(source).toContain('item.children?.length && !props.collapsed && (item.to || item.href) ? AccordionTrigger : \'span\'')
  })

  test('a click on the chevron of a group with no link reaches the group\'s own trigger', async () => {
    const source = await Bun.file(MENU).text()
    expect(source).toContain('props.orientation === "vertical" && !props.collapsed && (item.to || item.href)')
  })

  test('the console layout has one main landmark', async () => {
    const layout = await Bun.file('app/layouts/console.vue').text()
    expect(layout.match(/<main\b/g)?.length).toBe(1)
  })
})

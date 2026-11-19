<!-- Public text written in the small Markdown that text fields take (shared/markdown.ts): paragraphs,
     headings, lists, bold, italic and links. It is drawn from a parsed tree, never as HTML, so nothing
     typed can become markup or run a script. With `link-phones`, a telephone number in the text is a
     tel: link with a large target, for a card read on a phone in a hurry. With `inline`, it
     sits inside a line of other text, such as a list row's description, its paragraphs run together. -->
<script setup lang="ts">
import { h, type VNode } from 'vue'
import { parseMarkdown, type Block, type Inline } from '../../shared/markdown'

const props = defineProps<{ text: string | null | undefined, linkPhones?: boolean, inline?: boolean }>()
const blocks = computed(() => parseMarkdown(props.text))
// A run of digits with the spaces, brackets and dashes people write between them, or a short
// emergency number on its own. A date (2027-09-01) is not a number to ring.
const PHONE = /(\+?\d[\d\s()-]{5,}\d|\b(?:999|112|111)\b)/g // not-policy: the shape of a written telephone number
const SHORT = ['999', '112', '111'] // not-policy: the emergency and non-emergency short numbers
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date

function isPhone(part: string): boolean {
  const digits = part.replace(/\D/g, '')
  return !DATE.test(part.trim()) && (digits.length >= 7 || SHORT.includes(digits)) // not-policy: the shortest full number
}

function phones(text: string, tel: boolean): (VNode | string)[] {
  if (!props.linkPhones || !tel) return [text]
  return text.split(PHONE).map((part, i) => i % 2 === 1 && isPhone(part)
    ? h('a', { href: `tel:${part.replace(/[^\d+]/g, '')}`, class: 'inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4' }, part)
    : part).filter(part => part !== '')
}

function renderInline(nodes: Inline[], tel = true): (VNode | string)[] {
  return nodes.flatMap((n): VNode | string | (VNode | string)[] => {
    switch (n.type) {
      case 'text': return phones(n.text, tel)
      case 'break': return h('br')
      case 'strong': return h('strong', { class: 'font-semibold' }, renderInline(n.children, tel))
      case 'em': return h('em', renderInline(n.children, tel))
      case 'link': return h('a', { href: n.href, class: 'font-medium underline underline-offset-2 hover:no-underline' }, renderInline(n.children, false))
    }
  })
}
function block(b: Block): VNode {
  if (b.type === 'heading') return h(`h${b.level}`, { class: b.level === 3 ? 'text-base font-semibold text-highlighted' : 'font-medium text-highlighted' }, renderInline(b.children))
  if (b.type === 'list') return h(b.ordered ? 'ol' : 'ul', { class: ['space-y-1 ps-5', b.ordered ? 'list-decimal' : 'list-disc'] }, b.items.map(item => h('li', renderInline(item))))
  return h('p', renderInline(b.children))
}
const InlineText = () => blocks.value.flatMap((b, i) => [...(i ? [' '] : []), ...(b.type === 'list' ? b.items.flatMap((item, j) => [...(j ? [' · '] : []), ...renderInline(item)]) : renderInline(b.children))])
const Blocks = () => blocks.value.map(block)
</script>

<template>
  <span v-if="inline"><InlineText /></span>
  <div
    v-else
    class="space-y-3"
  >
    <Blocks />
  </div>
</template>

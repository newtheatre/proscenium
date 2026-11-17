<!-- Public text written in the small Markdown that text fields take (shared/markdown.ts): paragraphs,
     headings, lists, bold, italic and links. It is drawn from a parsed tree, never as HTML, so nothing
     typed can become markup or run a script. -->
<script setup lang="ts">
import { h, type VNode } from 'vue'
import { parseMarkdown, type Block, type Inline } from '../../shared/markdown'

const props = defineProps<{ text: string | null | undefined }>()
const blocks = computed(() => parseMarkdown(props.text))

function inline(nodes: Inline[]): (VNode | string)[] {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return n.text
      case 'break': return h('br')
      case 'strong': return h('strong', { class: 'font-semibold' }, inline(n.children))
      case 'em': return h('em', inline(n.children))
      case 'link': return h('a', { href: n.href, class: 'font-medium underline underline-offset-2 hover:no-underline' }, inline(n.children))
    }
  })
}
function block(b: Block): VNode {
  if (b.type === 'heading') return h(`h${b.level}`, { class: b.level === 3 ? 'text-base font-semibold text-highlighted' : 'font-medium text-highlighted' }, inline(b.children))
  if (b.type === 'list') return h(b.ordered ? 'ol' : 'ul', { class: ['space-y-1 ps-5', b.ordered ? 'list-decimal' : 'list-disc'] }, b.items.map(item => h('li', inline(item))))
  return h('p', inline(b.children))
}
const Blocks = () => blocks.value.map(block)
</script>

<template>
  <div class="space-y-3">
    <Blocks />
  </div>
</template>

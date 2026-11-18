// What the canvas shares with its lists and cards while something is dragged.
import type { InjectionKey, Ref } from 'vue'
import type { Item } from '../../shared/engine'

export const FORMS_CANVAS: InjectionKey<{ board: Ref<Record<string, Item[]>>, dragging: Ref<{ id: string, type: string } | null> }> = Symbol('forms.canvas')

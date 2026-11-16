import { defineListSource } from '#kit'
import { performances } from '../db/schema'

export default defineListSource({ id: 'seats.performances' }, { table: performances, search: ['title'] })

#!/usr/bin/env bun
// Per-table counts and domain checksums for all four dumps: the rehearsal baseline, on its own.
import { latestStamp } from './lib'
import { closeDumps, openDumps, stepInventory } from './steps'

const stamp = await latestStamp()
const dumps = await openDumps(stamp)
await stepInventory(stamp, dumps)
closeDumps(dumps)
console.log(`Inventory written for ${stamp}: out/manifest.json, out/manifest.md`)

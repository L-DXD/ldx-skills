#!/usr/bin/env node
// Usage: node scripts/render.mjs <template> <fixture.json>
// Replaces {{KEY}} in template with fixture[KEY], serialized per type:
//   string  -> raw insert
//   array (ALLOWED_TAG_KEYS, etc) -> TS single-quote array literal: ['a', 'b']
//   array under key ending with _UNION -> TS union: 'a' | 'b' | 'c'
//
// Exits non-zero on missing template/fixture or unresolved placeholders.

import { readFileSync } from 'node:fs'
import { argv, exit, stderr, stdout } from 'node:process'

if (argv.length !== 4) {
  stderr.write(`Usage: node ${argv[1]} <template> <fixture.json>\n`)
  exit(1)
}

const [, , templatePath, fixturePath] = argv
const template = readFileSync(templatePath, 'utf8')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

const serializeArray = (arr) => `[${arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(', ')}]`
const serializeUnion = (arr) => arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(' | ')

const serialize = (key, value) => {
  if (Array.isArray(value)) {
    return key.endsWith('_UNION') ? serializeUnion(value) : serializeArray(value)
  }
  if (typeof value === 'string') return value
  throw new Error(`unsupported value type for key ${key}: ${typeof value}`)
}

let output = template
for (const [key, value] of Object.entries(fixture)) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`invalid fixture key: ${key} (must match /^[A-Z_][A-Z0-9_]*$/)`)
  }
  const serialized = serialize(key, value)
  const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
  output = output.replace(pattern, serialized)
}

const leftover = output.match(/\{\{[A-Za-z0-9_]+\}\}/g)
if (leftover) {
  stderr.write(`unresolved placeholders: ${[...new Set(leftover)].join(', ')}\n`)
  exit(2)
}

stdout.write(output)

// The SVG cleaner (C-36) is security code: every way past it is a stored script on the site. These
// cases cover the branches domain.test.ts leaves untried.
import { describe, expect, it } from 'vitest'
import { cleanSvg, Rejected } from '../../server/files/inspect'

const encode = (text: string) => new TextEncoder().encode(text)
const svg = (body: string, attrs = 'viewBox="0 0 120 40"') => encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`)
const text = (bytes: Uint8Array) => new TextDecoder().decode(cleanSvg(bytes).bytes)

function reason(bytes: Uint8Array): string {
  try {
    cleanSvg(bytes)
    return 'accepted'
  }
  catch (error) {
    if (error instanceof Rejected) return error.reason
    throw error
  }
}

describe('the SVG cleaner refuses what could run or reach out', () => {
  it.each([
    ['a data: URI in an attribute', '<rect fill="data:image/svg+xml,x"/>', 'svg-external-reference'],
    ['a vbscript: link', '<use href="vbscript:msgbox(1)"/>', 'svg-external-reference'],
    ['a javascript: link split by whitespace', '<use href="java script:alert(1)"/>', 'svg-external-reference'],
    ['a javascript: link written as decimal entities', '<use href="&#106;avascript:alert(1)"/>', 'svg-external-reference'],
    ['an xlink:href to another file', '<use xlink:href="other.svg#a"/>', 'svg-external-reference'],
    ['a src attribute', '<rect src="https://evil.example/x"/>', 'svg-external-reference'],
    ['an event handler in capitals', '<rect ONCLICK="alert(1)"/>', 'svg-script'],
    ['a link element', '<a href="#x"><rect/></a>', 'svg-external-reference'],
    ['an iframe', '<iframe/>', 'svg-external-reference'],
    ['an unknown element', '<blink/>', 'svg-unsupported-content'],
    ['CSS expression()', '<style>rect { width: expression(alert(1)) }</style>', 'svg-external-reference'],
    ['a -moz-binding', '<rect style="-moz-binding: url(#x)"/>', 'svg-external-reference'],
    ['an escaped @import', '<style>@im\\port url(x.css);</style>', 'svg-external-reference'],
    ['an external url() in a CDATA style', '<style><![CDATA[rect { fill: url(https://evil.example/f) }]]></style>', 'svg-external-reference'],
    ['CDATA outside a style', '<g><![CDATA[<script>alert(1)</script>]]></g>', 'svg-unsupported-content'],
  ])('refuses %s', (_, body, expected) => {
    expect(reason(svg(body))).toBe(expected)
  })
})

describe('the SVG cleaner refuses a damaged file', () => {
  it.each([
    ['bytes that are not UTF-8', new Uint8Array([0x3C, 0x73, 0x76, 0x67, 0xFF, 0xFE])],
    ['a closing tag that does not match', svg('<g></rect>')],
    ['an element left open', encode('<svg xmlns="http://www.w3.org/2000/svg"><g>')],
    ['a style left open', encode('<svg xmlns="http://www.w3.org/2000/svg"><style>rect{}')],
    ['no svg element at all', encode('<g><rect/></g>')],
    ['a stray angle bracket', svg('<rect/> < ')],
  ])('refuses %s', (_, bytes) => {
    expect(reason(bytes)).toBe('damaged')
  })
})

describe('the SVG cleaner keeps drawing', () => {
  it('keeps internal references, gradients and internal url() fills', () => {
    const out = text(svg('<defs><linearGradient id="g"/></defs><use href="#g"/><rect style="fill:url(#g)"/>'))
    expect(out).toContain('<use href="#g"/>')
    expect(out).toContain('style="fill:url(#g)"')
  })

  it('keeps a style element with only internal references', () => {
    expect(text(svg('<style>rect { fill: url(#g) }</style><rect/>'))).toContain('<style>rect { fill: url(#g) }</style>')
  })

  it('drops a byte order mark, comments and processing instructions', () => {
    const out = text(encode('﻿<?xml version="1.0"?><!-- by Jo --><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
  })

  it('drops an editor\'s namespace declarations and anything inside its elements', () => {
    const out = text(svg('<sodipodi:namedview><inkscape:grid/></sodipodi:namedview><rect/>', 'xmlns:inkscape="http://www.inkscape.org" viewBox="0 0 1 1"'))
    expect(out).not.toContain('inkscape')
    expect(out).not.toContain('sodipodi')
  })

  it('escapes a double quote inside a single-quoted attribute', () => {
    expect(text(svg('<text font-family=\'Say "Hi"\'>x</text>'))).toContain('font-family="Say &quot;Hi&quot;"')
  })

  it('keeps an attribute with no value', () => {
    expect(text(svg('<rect hidden/>'))).toContain('<rect hidden/>')
  })

  it('reads the size from width and height in pixels before the viewBox', () => {
    expect(cleanSvg(svg('<rect/>', 'width="300px" height="100" viewBox="0 0 120 40"'))).toMatchObject({ width: 300, height: 100 })
  })

  it('takes the size from the viewBox when width and height are not pixels', () => {
    expect(cleanSvg(svg('<rect/>', 'width="100%" viewBox="0,0,64.4,32"'))).toMatchObject({ width: 64, height: 32 })
  })

  it('gives no size when there is neither', () => {
    expect(cleanSvg(svg('<rect/>', 'viewBox="nonsense"'))).toMatchObject({ width: null, height: null })
  })
})

import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-bar@e2e.newtheatre.org.uk'

// A detail screen is reached from its list: the first row's own link is followed before capture.
const openFirst = (prefix: string): string =>
  `document.querySelector('[data-test^="${prefix}"]')?.click()`

export const bar: Shot[] = [
  {
    name: 'bar/products',
    persona,
    url: '/bar/products',
    marker: '[data-test="bar-products-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="set-up-product"]', label: 'Set up a product' },
      { selector: '[data-test="add-product"]', label: 'Add a product' },
      { selector: '[data-test^="sizes-"]', label: 'Serving sizes' },
      { selector: '[data-test^="edit-"]', label: 'Edit' },
      { selector: '[data-test^="retire-"]', label: 'Retire' },
    ],
  },
  {
    name: 'bar/product-setup',
    persona,
    url: '/bar/products/new',
    marker: '[data-test="shape-cards"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="shape-simple"]', label: 'Sold as itself' },
      { selector: '[data-test="shape-measured"]', label: 'Sold by measure' },
      { selector: '[data-test="shape-recipe"]', label: 'Made from several things' },
    ],
  },
  {
    name: 'bar/serving-sizes',
    persona,
    url: '/bar/products',
    marker: '[data-test="bar-products-table"]',
    width: CONSOLE_WIDTH,
    after: openFirst('sizes-'),
    annotations: [
      { selector: '[data-test="product-name"]', label: 'The product' },
      { selector: '[data-test="add-variant"]', label: 'Add a serving size' },
      { selector: '[data-test^="recipe-"]', label: 'What it depletes' },
      { selector: '[data-test^="choice-"]:not([data-test^="clear-choice-"])', label: 'Add or change a choice' },
      { selector: '[data-test^="prices-"]', label: 'Prices' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters, including retired sizes' },
    ],
  },
  {
    name: 'bar/categories',
    persona,
    url: '/bar/categories',
    marker: '[data-test="bar-categories-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="add-category"]', label: 'Add a category' },
      { selector: '[data-test^="prices-"]', label: 'Default prices' },
      { selector: '[data-test^="edit-"]', label: 'Edit' },
    ],
  },
  {
    name: 'bar/discounts',
    persona,
    url: '/bar/discounts',
    marker: '[data-test="bar-discounts-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="add-discount"]', label: 'Add a discount' },
      { selector: '[data-test^="status-"]', label: 'Retire or put back' },
    ],
  },
  {
    name: 'bar/stock',
    persona,
    url: '/bar/stock',
    marker: '[data-test="bar-items-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="add-item"]', label: 'Add a stocked item' },
      { selector: '[data-test^="move-"]', label: 'Record a movement' },
      { selector: '[data-test^="edit-"]', label: 'Edit' },
      { selector: '[data-test^="status-"]:not([data-test^="status-badge-"])', label: 'Retire' },
    ],
  },
  {
    name: 'bar/movements',
    persona,
    url: '/bar/stock/movements',
    marker: '[data-test="bar-movements-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test^="reverse-"]', label: 'Reverse' },
    ],
  },
  {
    name: 'bar/stocktakes',
    persona,
    url: '/bar/stock/stocktakes',
    marker: '[data-test="bar-stocktakes-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="open-stocktake"]', label: 'Open a stocktake' },
      { selector: '[data-test^="stocktake-"]', label: 'Count or view' },
    ],
  },
  {
    name: 'bar/stocktake',
    persona,
    url: '/bar/stock/stocktakes',
    marker: '[data-test="bar-stocktakes-table"]',
    width: CONSOLE_WIDTH,
    after: openFirst('stocktake-'),
    annotations: [
      { selector: '[data-test="uncounted-count"]', label: 'Not yet counted' },
      { selector: '[data-test="stocktake-lines"]', label: 'The lines' },
      { selector: '[data-test^="variance-"]:not(:empty)', label: 'Variance' },
    ],
  },
  {
    name: 'bar/order-list',
    persona,
    url: '/bar/stock/order-list',
    marker: '[data-test="export-order-list"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="export-order-list"]', label: 'Export CSV' },
      { selector: '[data-test="order-list-group"]', label: 'A category group' },
    ],
  },
  {
    name: 'bar/reports',
    persona,
    url: '/bar/reports',
    marker: '[data-test="section-sales"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="period-kind"]', label: 'Period kind' },
      { selector: '[data-test="period-from"]', label: 'The dates' },
      { selector: '[data-test="refresh-report"]', label: 'Refresh' },
      { selector: '[data-test="export-sales"]', label: 'Export CSV' },
      { selector: '[data-test="gp-summary"]', label: 'Gross profit summary' },
    ],
  },
  {
    name: 'bar/tabs',
    persona,
    url: '/bar/tabs',
    marker: '[data-test="bar-tabs-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="bar-tabs-table"]', label: 'Every holder still carrying a balance' },
    ],
  },
]

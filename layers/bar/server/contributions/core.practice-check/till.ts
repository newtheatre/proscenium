// The bar till practice's tasks (BAR-59): a drink sold whose recipe took two or more stock items, and
// a refusal naming the age-restricted drink that raised the check, not a customer turned away unseen.
import { all, definePracticeChecks } from '#kit'

const any = async (sql: string) => (await all(sql)).length > 0

export default definePracticeChecks({
  'recipe-drink': () => any(`SELECT 1 FROM bar_stock_movements WHERE kind = 'sale' AND source_type = 'bar.sale-line'
    GROUP BY source_id HAVING count(DISTINCT stock_item_id) >= 2 LIMIT 1`),
  'refuse-age': () => any(`SELECT 1 FROM bar_age_checks a JOIN bar_variants v ON v.id = a.variant_id JOIN bar_products p ON p.id = v.product_id
    JOIN bar_categories c ON c.id = p.category_id
    WHERE a.outcome = 'refused' AND (CASE WHEN p.age_from_category = 1 THEN c.age_restricted ELSE p.age_restricted END) = 1 LIMIT 1`),
})

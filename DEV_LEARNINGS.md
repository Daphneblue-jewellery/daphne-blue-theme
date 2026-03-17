# Daphne Blue — Dev Learnings

Hard-won lessons from the build. Follow these to avoid repeating mistakes.

---

## 1. Never rewrite template JSON files with `json.dump`

**What happened:** Used Python `json.dump` to edit a single setting in `templates/index.json`. It rewrote the entire file, and `shopify theme dev` synced the rewritten version back to the dev theme — wiping out product selections the Theme Editor had just saved.

**Rule:** Template JSON files (`templates/*.json`, `config/settings_data.json`) are shared state between the local filesystem and the Theme Editor. Never rewrite them programmatically while `shopify theme dev` is running. Use targeted string replacement (e.g. `sed`, `Edit` tool) or make changes directly in the Theme Editor.

---

## 2. `| money` is not the Daphne Blue price format

**What happened:** Custom sections and AI-generated blocks used Shopify's `| money` filter, which outputs `£0.00`. The brand format is `GBP 95` — no symbol, no decimals.

**Rule:** Always use the `db-price-format` snippet for prices:
```liquid
{% render 'db-price-format', price_in_cents: product.price %}
```
Never use `| money`, `| money_with_currency`, or `| money_without_trailing_zeros` in custom sections. The Horizon core `snippets/price.liquid` is already wired to use `db-price-format`.

---

## 3. `section.settings.products` being empty ≠ no products exist

**What happened:** The Favourites section showed placeholder SVGs and hardcoded names ("Pearl Coast Necklace") because the `product_list` setting was empty — not because the products lacked images.

**Rule:** When product images aren't showing, check the template JSON settings first. A `product_list` setting of `[]` means no products were assigned to the section, so it falls through to placeholder/onboarding content.

---

## 4. Horizon's `.text-block` transform leaks everywhere

**Context:** Horizon has a global `.text-block { transform: translate(-50%, -50%); top: 50%; left: 50%; position: absolute }` rule for hero overlays. It leaks onto ALL `.text-block` elements site-wide.

**Rule:** On product pages and any non-hero context, reset with:
```css
position: relative;
transform: none;
top: auto;
left: auto;
width: 100%;
```

---

## 5. Schema `range` defaults must land exactly on a step

**What happened:** A section silently failed to parse. Shopify reported "does not refer to an existing section file" — a misleading error.

**Rule:** For any `range` setting, verify: `(default - min) % step === 0`. If the default doesn't land on a step, the entire section breaks.

---

## 6. `section.settings.db_mode` doesn't resolve in product recommendations

**What happened:** CSS scoped to `db_mode` didn't apply inside the product-recommendations section. Shopify's recommendations endpoint ignores template JSON settings on both initial render and AJAX fetch.

**Rule:** Use `body.db-product-page` class (added by `product-information.liquid` script) to scope recommendation styles from the body, not from section settings.

---

## 7. `display: contents` on `<a>` wrappers breaks width chain

**Context:** Horizon cards wrap content in `<a>` tags with `display: contents`. Child `.text-block` elements lose their width reference.

**Rule:** Force `width: 100% !important` on `.text-block` inside cards that use `display: contents` wrappers.

---

## 8. `--font-heading--family` is not Maragsa Display

**What happened:** Assumed `var(--font-heading--family)` would resolve to Maragsa Display. It actually resolves to Anonymous Pro (the theme setting).

**Rule:** Reference `"Maragsa Display", serif` directly when you need the brand heading font. Don't rely on the CSS variable.

---

## 9. `settings_data.json` gets dirty from Theme Editor use

**Rule:** The Theme Editor writes to `config/settings_data.json` constantly. Be deliberate about committing it — review diffs carefully. Same applies to collection template JSONs which bulk-change from Editor config.

---

## 10. `block.id` uses hash prefixes

**What happened:** Equality check `block.id == 'db_title'` failed because the actual ID is something like `Abc123__db_title`.

**Rule:** Use `contains` not `==` when matching block IDs:
```liquid
{% if block.id contains 'db_title' %}
```

---

## 11. `section.type` is empty inside blocks

**Rule:** Use `section.settings.db_mode` instead of `section.type` when you need to know the section context from within a block.

---

## 12. Horizon compiled stylesheets load before section assets

**Context:** `{% stylesheet %}` blocks get compiled into `compiled_assets/styles.css`, which loads before section-specific assets.

**Rule:** CSS `!important` is genuinely needed to override Horizon's compiled grid rules from `base.css` or section assets. This is by design, not laziness.

---

## 13. Override `padding-block` with longhands, not shorthand

**Context:** Horizon's `.spacing-style` uses `padding-block` shorthand derived from `--padding-block-start` inline vars.

**Rule:** Override with `padding-block-start` / `padding-block-end` longhands to avoid cascade conflicts with the shorthand.

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

---

## 14. Product card image container must match gallery aspect ratio and radius

**What happened:** On The Land collection page, the Meadow Stud Earrings card (with a real image) was shorter and had rounder corners than the placeholder cards beside it. The `.card-gallery` wrapper used `aspect-ratio: 4 / 5` and `border-radius: 8px`, but the inner `.product-media-container` had `aspect-ratio: 1 / 1.15` (→ 442px instead of 480px) and `border-radius: var(--db-radius-lg)` (18px).

**Rule:** When styling Horizon's `.product-card .product-media-container`, ensure its `aspect-ratio` and `border-radius` match the parent `.card-gallery` values. The gallery controls the placeholder sizing; the media container controls the image sizing. If they disagree, cards with images will be a different size/shape from cards without.

---

## 15. PDP `--ratio` must be set on the shared parent, not just the placeholder

**What happened:** On the Meadow Stud Earrings product page, the hero image (733×656) was taller than placeholders on other product pages (733×587). The `--ratio: 5 / 4` inline style was only set on the `.db-product-media__placeholder` div, so the Horizon `slideshow-container` (used for real images) never inherited it and fell back to the image's natural aspect ratio.

**Rule:** Set `--ratio` on the parent `.db-product-media` div so both rendering paths — the placeholder div and the Horizon slideshow — inherit the same aspect ratio. Then target `slideshow-container` and `.product-media-container` in CSS with `aspect-ratio: var(--ratio, 1)` to enforce it. The placeholder and real-image paths must always produce identical dimensions.

---

## 16. Brand-restyling Horizon shared components: override in `base.css`, don't fight theme settings

**What happened:** The "Back soon" (formerly "Currently unavailable") product card badge needed to drop its pill background, padding, and border-radius and adopt Daphne Blue press-style typography. The badge styling in `snippets/product-card-badges.liquid` is driven by Horizon theme settings (`badge_corner_radius`, `badge_font_family`, `badge_text_transform`, `badge_sold_out_color_scheme`). The same component renders both the sold-out badge AND the sale badge — changing the theme settings would change both.

**Final implementation note:** After iterating through several approaches (no-pill press typography, off-image metadata line, opaque pill, frosted-glass pill), the final design is a **frosted-glass pill**, in-image, top-right:
- Background: `rgba(250, 250, 248, 0.78)` (semi-transparent Soft White)
- `backdrop-filter: blur(10px)` — feels embedded in the photograph rather than stuck on top
- No border — pill floats
- Border-radius: `4px` — editorial, less than Shopify default
- Padding: `6px 10px` — compact
- Color: `#3F6B7A` (deep daphne-blue, brand-family but dark enough for contrast against the frosted panel)
- Press-style typography (0.7rem, uppercase, 0.18em letter-spacing, font-weight 400)

Why this won over the alternatives:
- **Pure-typography (no pill)**: failed contrast on bright golden-hour lifestyle imagery
- **Off-image metadata line**: kept the photograph clean but buried availability info
- **Opaque pill**: read as a Shopify-default sticker rather than a brand element

Frosted blur is the single move that lifts a pill from "Shopify default" to "premium 2025". Sale badge is untouched and still inherits Horizon theme settings.

---

## 19. Theme Editor changes on the LIVE theme don't propagate to dev — pull-restart dance required

**What happened:** Dev theme (`#198082560332`) and live theme (`#194203582796`) coexist. After a `shopify theme push --theme=<live-id>`, the owner opened the live theme's Theme Editor and made image/product assignments (Discover tiles, Favourites). Those changes saved to the **live** theme's template JSONs only. Dev theme + local were stale.

The naive fix (just pulling from live) doesn't work while `shopify theme dev` is running — dev's continuous two-way sync immediately re-pushes the stale local back up, overwriting both the live changes AND any pull progress before it completes.

**Rule (the dance):**
1. **Stop** `shopify theme dev` (kill the process)
2. `shopify theme pull --theme=<live-id> --only "templates/*.json" --only "config/settings_data.json"` — pull only the files Theme Editor touches
3. **Restart** `shopify theme dev` — dev's startup auto-syncs local → dev theme, so both themes converge

**Going forward — single source of truth:** To avoid this entirely, only edit Theme Editor on the **dev** theme (URL: `/admin/themes/<dev-id>/editor?hr=9292`). Dev's two-way sync keeps local in step automatically. When ready to ship, push dev → live with `shopify theme push --theme=<live-id>`. If a Theme Editor change does land on live by mistake, the dance above is the recovery.

---

## 18. PDP responsive media queries MUST be inline alongside the desktop rule

**What happened:** Raised the PDP single-column breakpoint from 749px to 899px by editing `assets/db-product.css`. The change had zero effect — the desktop two-column rule continued rendering at 820px viewport. Cause: the desktop `grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)` rule is **inlined** in `sections/product-information.liquid` (per its own "MUST be inline" comment about Horizon `compiled_assets/styles.css` cascade conflicts). External `db-product.css` media queries lose to the inline rule.

**Rule:** When changing PDP layout breakpoints, the media query override MUST be added inline in `product-information.liquid` (after the desktop grid rule), not just in `db-product.css`. The mobile rule must also reset BOTH `grid-column` AND `grid-row` for `__media` and `product-details` (the desktop rule pins both to `grid-row: 1`, which causes them to overlap in the same cell when stacked into a single column).

**Pattern to follow:**
```css
/* Inline in product-information.liquid, AFTER the desktop grid rule */
@media screen and (max-width: 899px) {
  .db-product .product-information__grid {
    grid-template-columns: 1fr !important;
    column-gap: 0 !important;
    row-gap: clamp(24px, 4vw, 48px);
  }
  .db-product .product-information__media {
    grid-column: 1 / -1 !important;
    grid-row: 1 !important;
  }
  .db-product .product-details,
  .db-product .product-details.sticky-content--desktop {
    grid-column: 1 / -1 !important;
    grid-row: 2 !important;
    width: 100% !important;
  }
}
```
Mirror the same breakpoint in `db-product.css` for consistency, but treat the inline version as the source of truth.

---

## 17. Mobile drawer renders TWO navigation sources — suppress the duplicate

**What happened:** `snippets/header-drawer.liquid` renders both Daphne Blue's custom curated nav (`.db-drawer-search-suggestions` containing "Shop by Element / Piece / Intention", lines 105-133) AND Horizon's default linklist iteration (`<nav class="menu-drawer__navigation">`, lines 135-609) in the same drawer. The result: the curated taxonomy was followed by a duplicate `EXPLORE / NECKLACES / RINGS / EARRINGS / BRACELETS` all-caps list rendered from the Shopify `main-menu` linklist.

**Rule:** When customising the mobile drawer, the curated DB suggestions and the Horizon default nav coexist. To use only the curated nav, suppress the Horizon default with a CSS override in `base.css`:
```css
.menu-drawer__navigation {
  display: none !important;
}
```
This keeps the Horizon snippet structure intact (no fighting the theme), preserves `.menu-drawer__utility-links` (account, locale) below, and follows the override-don't-fight-Horizon pattern from #16.

**Note:** If you ever want to use the Horizon default nav AND the curated suggestions together (e.g. featured products or collection images in mega-menu), remove the `display: none` rule. They're not mutually exclusive at the snippet level — only by visual choice.

**Rule:** When restyling a Horizon component that's shared across multiple states (or where you only want to change one variant):

1. **Don't** change the underlying theme settings — they're shared and affect other variants/sections.
2. **Don't** rewrite the snippet's `{% stylesheet %}` block — it's compiled into `compiled_assets/styles.css` and version-managed by Horizon's build pipeline.
3. **Do** add a single-line modifier-class hook to the snippet (e.g. `product-badges__badge--sold-out` vs `product-badges__badge--sale`) so each variant can be targeted independently.
4. **Do** put the brand override in `assets/base.css`, scoped to the modifier class, with `!important` on the properties that need to win against `compiled_assets/styles.css` (which loads first).
5. **Do** leave a `/* See DEV_LEARNINGS.md #N */` reference comment in `base.css` so the next dev knows why the override is there.

This pattern keeps theme settings working for non-DB customisations, leaves untouched variants alone, and centralises Daphne Blue overrides in `base.css` (single source of truth).

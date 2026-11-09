# Manual test checklist

Browser steps that automated checks cannot cover. Tick each box and note any bug.
**Cost warning:** uploading a *new* photo, generating recipes with new ingredients, asking for
substitutions and picking a recipe (cart agent) each make paid Gemini calls. To avoid that, prefer
existing scans from History, or repeat a scan with the same ingredient list (recipes come from the
Redis cache, if configured).

Setup: `pnpm dev`, open http://localhost:3000. Test desktop (about 1280px wide) and mobile
(browser devtools, e.g. 390 × 844, or a real phone on the same network).

## 1. Sign-in and sign-out
- [ ] Opening any page while signed out redirects to `/signin`.
- [ ] The sign-in page shows the tester email and password (and never the admin ones).
- [ ] Signing in as the tester with those credentials lands on the home page.
- [ ] A wrong password and an unknown email both show "Incorrect email or password.".
- [ ] Email works in any letter case (e.g. `TESTER@FridgeToCart.demo`).
- [ ] Signing in as the admin account (with its private password) also works.
- [ ] Refreshing keeps you signed in.
- [ ] Sign out returns to `/signin`; the back button does not show scan data; `/history` redirects to `/signin`.

## 2. Upload and review (new photo = paid call)
- [ ] Picking a photo shows a preview; a very large photo still uploads.
- [ ] The review screen lists detected items; low-confidence items are highlighted.
- [ ] You can rename, delete and add an item and add cupboard chips (rice, atta).
- [ ] Confirming moves to recipes.

## 3. Recipes and substitutions (existing/cached data preferred)
- [ ] 3–5 recipe cards show have/missing pills and a diet badge.
- [ ] "Show steps" expands and collapses; the source link opens.
- [ ] "Suggest substitutes for missing items" shows a spinner, then options (**paid call**). If it fails, a readable error appears and the button still works.
- [ ] Each option shows the missing item, the substitute, an "In your fridge" / "Needs buying" badge, a reason and the taste note.
- [ ] Accept: the pill changes to "X for Y" and the have/missing counts update. Undo restores the original.
- [ ] Reject hides that suggestion; "Other options (n/m)" cycles alternatives.
- [ ] "Revert all" restores the original recipe.
- [ ] With a Jain / vegetarian profile (Preferences), no suggested substitute breaks the diet or the avoid list.

## 4. Pick and cart (cart agent = paid call)
- [ ] "Cook this" shows "Building your cart…" and ends on the cart page.
- [ ] Items you accepted as in-fridge substitutes are **not** in the cart; a substitute marked "Needs buying" **is**.
- [ ] The cart page lists "Substituted X with Y".
- [ ] The qty stepper changes quantity and the total; 0 removes a line.
- [ ] Each line has working Blinkit and Zepto links (open in a new tab, search the right item).
- [ ] An "unavailable" item shows fallback links.
- [ ] A recipe with nothing missing shows "You have everything!".

## 5. History and preferences
- [ ] History lists past scans with status and recipe title; opening one lands on the right step (review, recipes or cart).
- [ ] Preferences: change diet, avoid list and max time, save, reload; the values persist.
- [ ] The next scan's recipes respect the new preferences.

## 6. Layout (desktop and mobile)
- [ ] No horizontal scrolling at 390px wide on any page.
- [ ] Buttons are tappable (no overlap), and long ingredient names and reasons wrap.
- [ ] Recipe cards, substitution panel and cart rows are readable at both widths.
- [ ] Keyboard: Tab reaches Accept / Reject / Undo and the focus ring is visible.

## 7. External grocery links
- [ ] Blinkit and Zepto links open `https://blinkit.com/s/?q=…` and `https://www.zeptonow.com/search?query=…` with the ingredient in the search box. (These are search URLs, not product pages; if a site changes its URL format, the link may land on its home page.)

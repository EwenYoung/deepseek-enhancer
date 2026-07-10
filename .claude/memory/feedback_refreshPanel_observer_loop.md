---
name: refreshPanel-in-mutation-observer-causes-flicker
description: Calling refreshPanel() inside sidebar MutationObserver causes button flicker due to innerHTML rebuild
type: feedback
---

**Rule:** When adding `refreshPanel()` inside a MutationObserver callback that watches a DOM subtree containing the panel, add mouse hover detection to skip refresh while the user is interacting with the panel.

**Why:** `refreshPanel()` uses `innerHTML` assignment to rebuild the panel content. This destroys and recreates all DOM elements, losing hover/active states. When called from `handleSidebarMutation()` (which fires on every sidebar DOM change), buttons flicker as the user hovers.

**How to apply:** Use a `_panelHovered` flag set by `mouseenter`/`mouseleave` on `panelEl`. Skip `refreshPanel()` in the observer callback when `_panelHovered` is true:

```javascript
panelEl.addEventListener("mouseenter", () => { _panelHovered = true; });
panelEl.addEventListener("mouseleave", () => { _panelHovered = false; });
// In observer callback:
if (!_panelHovered) refreshPanel();
```

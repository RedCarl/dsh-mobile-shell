/**
 * @local/dsh-mobile-shell — Browser half.
 *
 * A phone-sized shell layered over the stock Web UI, without replacing any
 * shipped surface:
 *
 *   - the real left Sidebar becomes an off-canvas drawer (its session list,
 *     workspace list, panel list and settings stay the shipped occupants);
 *   - a bottom navigation bar opens that drawer, starts a Session, opens the
 *     Files panel and a "More" sheet with labelled panel shortcuts;
 *   - a menu button sits in the conversation header's leading seat;
 *   - touch rules make row actions and hit targets usable, and stop iOS from
 *     zooming the page when the composer takes focus;
 *   - plugin pages (desktop-designed tables) get a "Desktop view" chip that
 *     switches the viewport to 1024 CSS px, pinch-zoomable.
 *
 * Every visual override is gated behind `html[data-dsh-mobile]`, which is only
 * set for a phone-sized viewport while this plugin is enabled. A desktop window
 * therefore renders the stock UI with no layout change; the only added nodes
 * are one <style> element and (on phones) the bar/overlay components.
 *
 * The frame, sidebar column and center column are located by CSS-module class
 * substrings at runtime and tagged with data attributes; nothing here depends on
 * a hashed class name. If the tag cannot be placed, no navigation renders and
 * the status is reported in the More sheet, so a future upstream rename can
 * never leave a half-broken chrome.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-mobile-shell',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'mobile-shell';
    /** Host route serving this plugin's row config. */
    const CONFIG_ROUTE = 'plugins/mobile-shell/config';

    /** Per-device overrides, stored in the browser. */
    const STORAGE = {
      enabled: 'dsh-mobile-shell:enabled',
      desktop: 'dsh-mobile-shell:desktop',
      force: 'dsh-mobile-shell:force-mobile',
    };

    /** Config defaults, mirrored by the Host half. */
    const DEFAULT_CONFIG = {
      enabled: true,
      breakpointPx: 767,
      bottomBar: true,
      panelChip: true,
      keyboardFit: true,
    };

    /** CSS-module class substrings used only to locate elements once. */
    const SELECTOR = {
      sidebar: '[class*="_sidebarCol"]',
      center: '[class*="_centerCol"]',
    };

    /** Attributes this plugin adds. */
    const ATTR = {
      frame: 'data-dsh-ms-frame',
      sidebar: 'data-dsh-ms-sidebar',
      center: 'data-dsh-ms-center',
      mobile: 'data-dsh-mobile',
      drawer: 'data-dsh-ms-drawer',
      bar: 'data-dsh-ms-bar',
      desktop: 'data-dsh-ms-desktop',
      keyboard: 'data-dsh-ms-kb',
    };

    /** Drawer/sheet/bar chrome, plus every gated override of the stock UI. */
    const css = `
      /* ── our own chrome ─────────────────────────────────────────────── */
      /* Our chrome is sized border-box: width:100% + horizontal padding must not
         push the sheet past the viewport (the close button was clipped on phones). */
      .dsh-ms-sheet,.dsh-ms-sheet *,.dsh-ms-bar,.dsh-ms-bar *,.dsh-ms-list-row,.dsh-ms-tile,.dsh-ms-row,
      .dsh-ms-chip,.dsh-ms-pill,.dsh-ms-float-menu{box-sizing:border-box}

      .dsh-ms-bar{box-sizing:border-box;display:flex;align-items:stretch;justify-content:space-around;width:100%;
        height:calc(52px + env(safe-area-inset-bottom,0px));padding:0 4px env(safe-area-inset-bottom,0px);
        background:var(--dsw-alias-bg-base);
        background:color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent);
        -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
        border-top:.5px solid var(--dsw-alias-border-l3);
        -webkit-tap-highlight-color:transparent;user-select:none}
      .dsh-ms-btn{appearance:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;
        font-size:11px;line-height:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:3px;flex:1 1 0;min-width:0;padding:6px 4px 4px;border-radius:10px;cursor:pointer;touch-action:manipulation}
      .dsh-ms-btn>svg{width:20px;height:20px;flex:none}
      .dsh-ms-btn{position:relative}
      .dsh-ms-btn:active{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-ms-btn[data-active="true"]{color:var(--dsw-alias-label-primary)}
      .dsh-ms-btn[data-disabled="true"]{opacity:.38;pointer-events:none}
      .dsh-ms-header-btn{width:32px;height:32px;border:0;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);
        display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;touch-action:manipulation}
      .dsh-ms-header-btn:active{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-ms-backdrop{position:absolute;inset:0;z-index:30;background:rgb(0 0 0/.42);opacity:0;
        pointer-events:none!important;transition:opacity .2s var(--ds-ease-in-out,ease)}
      html[data-dsh-mobile][data-dsh-ms-drawer="open"] .dsh-ms-backdrop{opacity:1;pointer-events:auto!important}
      .dsh-ms-sheet-wrap{position:absolute;inset:0;z-index:45;display:flex;flex-direction:column;justify-content:flex-end;pointer-events:none}
      /* Sit above the tab bar so the bottom navigation stays visible and tappable. */
      html[data-dsh-mobile][data-dsh-ms-bar="on"] .dsh-ms-sheet-wrap{bottom:calc(52px + env(safe-area-inset-bottom,0px))}
      .dsh-ms-sheet-scrim{position:absolute;inset:0;background:rgb(0 0 0/.45);pointer-events:auto;
        animation:dsh-ms-scrim-in .22s ease-out both}
      .dsh-ms-sheet{position:relative;pointer-events:auto;margin:0 auto;width:100%;max-width:560px;
        display:flex;flex-direction:column;max-height:min(72vh,560px);max-height:min(72dvh,560px);
        overflow:hidden;overscroll-behavior:contain;background:var(--dsw-alias-bg-base,Canvas);
        border-radius:20px 20px 0 0;border-top:.5px solid var(--dsw-alias-border-l1);
        box-shadow:0 -18px 48px rgb(0 0 0/.34);transform-origin:50% 100%;
        animation:dsh-ms-sheet-in .28s cubic-bezier(.22,1,.36,1) both}
      /* The title row and close button stay put; only the body scrolls. */
      .dsh-ms-sheet-top{flex:none;padding:6px 16px 4px}
      .dsh-ms-sheet-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;
        padding:4px 16px calc(12px + env(safe-area-inset-bottom,0px));-webkit-overflow-scrolling:touch}
      html[data-dsh-mobile][data-dsh-ms-bar="on"] .dsh-ms-sheet-body{padding-bottom:12px}
      @keyframes dsh-ms-sheet-in{from{transform:translateY(32px) scale(.985);opacity:.55}to{transform:none;opacity:1}}
      @keyframes dsh-ms-sheet-out{from{transform:none;opacity:1}to{transform:translateY(32px) scale(.985);opacity:0}}
      @keyframes dsh-ms-scrim-in{from{opacity:0}to{opacity:1}}
      @keyframes dsh-ms-scrim-out{from{opacity:1}to{opacity:0}}
      [data-dsh-ms-sheet-wrap][data-closing="true"]{pointer-events:none}
      [data-dsh-ms-sheet-wrap][data-closing="true"] .dsh-ms-sheet{
        animation:dsh-ms-sheet-out .2s cubic-bezier(.4,0,1,1) both}
      [data-dsh-ms-sheet-wrap][data-closing="true"] .dsh-ms-sheet-scrim{
        animation:dsh-ms-scrim-out .18s ease-in both}
      @media (prefers-reduced-motion:reduce){
        .dsh-ms-sheet,.dsh-ms-sheet-scrim,
        [data-dsh-ms-sheet-wrap][data-closing="true"] .dsh-ms-sheet,
        [data-dsh-ms-sheet-wrap][data-closing="true"] .dsh-ms-sheet-scrim{animation:none!important}
        html[data-dsh-mobile] [data-dsh-ms-sidebar]{transition:none}
      }
      .dsh-ms-sheet-grip{width:36px;height:4px;border-radius:999px;background:var(--dsw-alias-border-l2);margin:4px auto 10px}
      .dsh-ms-sheet-head{display:flex;align-items:center;gap:8px;padding:0 2px 10px}
      .dsh-ms-sheet-title{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
      .dsh-ms-sheet-close{flex:none;width:32px;height:32px;padding:0;border:0;border-radius:50%;
        background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);
        display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}
      .dsh-ms-section{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:14px 2px 8px}
      .dsh-ms-list-row{display:flex;align-items:center;gap:10px;width:100%;min-height:50px;padding:0 14px;
        border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;
        background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent);
        color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px;text-align:left;
        cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .dsh-ms-list-row:active{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-ms-list-row>svg{flex:none;color:var(--dsw-alias-label-secondary)}
      .dsh-ms-list-row>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ms-list-row>span.dsh-ms-chevron{flex:none;color:var(--dsw-alias-label-tertiary);display:inline-flex}
      .dsh-ms-row>span.dsh-ms-chevron{flex:none;color:var(--dsw-alias-label-tertiary);display:inline-flex}
      .dsh-ms-list-row+.dsh-ms-list-row{margin-top:8px}
      .dsh-ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .dsh-ms-tile{display:flex;align-items:center;gap:10px;min-width:0;min-height:50px;padding:0 12px;
        border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;
        background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent);
        color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;
        cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .dsh-ms-tile:active{background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-ms-tile>svg{flex:none;color:var(--dsw-alias-label-secondary)}
      .dsh-ms-tile>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ms-tile[data-active="true"]{color:var(--dsw-alias-state-business-primary);
        border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}
      .dsh-ms-tile[data-active="true"]>svg{color:currentColor}
      .dsh-ms-group{border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;overflow:hidden;
        background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent)}
      .dsh-ms-row{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:0 14px;
        border:0;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px;
        text-align:left;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .dsh-ms-row+.dsh-ms-row{border-top:.5px solid var(--dsw-alias-border-l3)}
      .dsh-ms-row>svg{flex:none;color:var(--dsw-alias-label-secondary)}
      .dsh-ms-row>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ms-switch{flex:none;position:relative;display:inline-block;width:40px;height:24px;border-radius:999px;
        background:var(--dsw-alias-interactive-bg-hover);border:.5px solid var(--dsw-alias-border-l3);transition:background .15s}
      .dsh-ms-switch:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
        background:var(--dsw-alias-bg-base);box-shadow:0 1px 3px rgb(0 0 0/.25);transition:transform .15s}
      .dsh-ms-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary);border-color:transparent}
      .dsh-ms-switch[aria-checked="true"]:after{transform:translateX(16px);background:#fff}
      .dsh-ms-state{flex:none;max-width:54%;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dsh-ms-row[data-update="available"] .dsh-ms-state{color:var(--dsw-alias-state-business-primary);font-weight:600}
      .dsh-ms-spin{flex:none;width:16px;height:16px;border-radius:50%;
        border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);
        animation:dsh-ms-spin .8s linear infinite}
      @keyframes dsh-ms-spin{to{transform:rotate(360deg)}}
      .dsh-ms-badge{position:absolute;top:8px;right:calc(50% - 14px);width:6px;height:6px;border-radius:50%;
        background:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-base,Canvas)}
      .dsh-ms-foot{display:flex;align-items:center;gap:12px;padding:16px 4px 2px}
      .dsh-ms-foot-status{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ms-foot-link{flex:none;border:0;background:0 0;padding:4px 2px;cursor:pointer;
        color:var(--dsw-alias-link,var(--dsw-alias-state-business-primary));font:inherit;font-size:12px;line-height:18px}

      .dsh-ms-chip,.dsh-ms-pill{position:absolute;z-index:25;right:10px;display:inline-flex;align-items:center;gap:6px;
        height:34px;padding:0 12px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);
        background:var(--dsw-alias-bg-base);
        background:color-mix(in srgb,var(--dsw-alias-bg-base) 90%,transparent);
        -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
        color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;cursor:pointer;
        box-shadow:0 4px 16px rgb(0 0 0/.16);touch-action:manipulation}
      .dsh-ms-chip{bottom:calc(52px + env(safe-area-inset-bottom,0px) + 12px)}
      .dsh-ms-pill{bottom:calc(env(safe-area-inset-bottom,0px) + 10px)}
      .dsh-ms-chip svg,.dsh-ms-pill svg{flex:none;width:16px;height:16px}
      .dsh-ms-float-menu{position:absolute;z-index:25;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);
        width:44px;height:44px;border-radius:50%;border:.5px solid var(--dsw-alias-border-l2);
        background:var(--dsw-alias-bg-base);display:inline-flex;align-items:center;justify-content:center;
        color:var(--dsw-alias-label-secondary);cursor:pointer;box-shadow:0 4px 16px rgb(0 0 0/.18);touch-action:manipulation}
      .dsh-ms-float-menu svg{width:20px;height:20px}

      /* ── the sidebar column becomes a drawer ─────────────────────────── */
      html[data-dsh-mobile]{-webkit-text-size-adjust:100%;overscroll-behavior:none}
      html[data-dsh-mobile] body{overscroll-behavior:none}
      html[data-dsh-mobile] [data-dsh-ms-frame]{grid-template-columns:0 minmax(0,1fr) 0!important}
      /* The out-of-flow (absolute) sidebar leaves the grid, so the remaining columns must be
         placed explicitly — otherwise the center auto-places into the empty
         first track (width 0) and the conversation disappears. */
      html[data-dsh-mobile] [data-dsh-ms-frame]>[data-dsh-ms-center]{grid-column:2!important;grid-row:1!important;min-width:0}
      html[data-dsh-mobile] [data-dsh-ms-frame]>[data-rightbar-col]{grid-column:3!important;grid-row:1!important}
      html[data-dsh-mobile] [data-dsh-ms-sidebar]{position:absolute!important;inset:0 auto 0 0;
        width:100%!important;max-width:100%;z-index:31;transform:translateX(-102%);
        transition:transform .22s var(--ds-ease-in-out,ease);will-change:transform;
        box-shadow:0 0 32px rgb(0 0 0/.30);border-right:.5px solid var(--dsw-alias-border-l3);
        padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
        overscroll-behavior:contain}
      html[data-dsh-mobile][data-dsh-ms-drawer="open"] [data-dsh-ms-sidebar]{transform:none;box-shadow:0 0 48px rgb(0 0 0/.38)}
      /* Keep the bottom navigation reachable while the drawer is open: stop the
         drawer (and its scrim) exactly above the bar. With the bar off, the
         drawer keeps the full height and owns the bottom safe area. */
      html[data-dsh-mobile][data-dsh-ms-bar="on"] [data-dsh-ms-sidebar]{
        bottom:calc(52px + env(safe-area-inset-bottom,0px));padding-bottom:0}
      html[data-dsh-mobile][data-dsh-ms-bar="on"] .dsh-ms-backdrop{
        top:0;left:0;right:0;bottom:calc(52px + env(safe-area-inset-bottom,0px))}
      /* The sidebar slot outlet wraps its entry in a display:contents anchor, so
         the visible root is a grandchild: size that, not the anchor. */
      html[data-dsh-mobile] [data-dsh-ms-sidebar]>[data-slot="sidebar"]>*{width:100%!important;max-width:100%}
      html[data-dsh-mobile] [data-dsh-ms-sidebar]>*>*{width:100%!important;max-width:100%}
      html[data-dsh-mobile] [data-dsh-ms-sidebar]>*{width:100%!important;max-width:100%}
      html[data-dsh-mobile] [data-dsh-ms-frame]>[class*="_handle"]{display:none!important}

      /* ── touch affordances ───────────────────────────────────────────── */
      @media (hover:none),(pointer:coarse){
        html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_rowActions"]{display:inline-flex!important}
        html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_sessionRow"]{height:40px!important}
        html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_projectRow"]{min-height:40px}
        html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_iconButton"]{width:36px!important;height:36px!important}
      }

      /* The workspace header keeps 28px controls: its search slot (28px) and
         action cluster (60px) are fixed widths, so enlarging them clips the last icon. */
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_sectionHeader"] [class*="_iconButton"],
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_sectionHeader"] [class*="_searchButton"]{
        width:28px!important;height:28px!important}

      /* ── compact, full-width drawer: give the workspace list the room ── */
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_logoRow"]{height:46px;margin-bottom:0;padding:4px 0}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] button[class*="_newSession"]{
        height:42px;margin-top:2px;margin-bottom:8px}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] button[class*="_newSession"] [class*="_newSessionContent"]{
        width:auto;flex:1;justify-content:center;gap:8px}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] button[class*="_newSession"] [class*="_newSessionLabelMask"]{
        flex:0 1 auto;text-align:center}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] button[class*="_newSession"] [class*="_newSessionShortcut"]{display:none}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_panelList"]{
        flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;margin-bottom:6px;
        overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_panelList"]::-webkit-scrollbar{display:none}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_panelRow"]{
        flex:none;width:auto;min-height:34px;margin:0;padding:5px 10px;gap:6px;border-radius:999px;
        border:.5px solid var(--dsw-alias-border-l3)}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_panelTitle"]{max-width:none;font-size:13px}

      /* ── the drawer is the session browser ──────────────────────────────
         Panel shortcuts and the account/settings foot live in the More sheet
         instead, so what is left here is brand, new session and the lists. */
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_panelList"]{display:none!important}
      html[data-dsh-mobile] [data-dsh-ms-sidebar] [class*="_footArea"]{display:none!important}
      /* Fallback: if the account menu cannot be anchored, the drawer reveals its foot. */
      html[data-dsh-mobile][data-dsh-ms-foot="on"] [data-dsh-ms-sidebar] [class*="_footArea"]{display:flex!important}
      /* While the More sheet opens the stock account menu, the docked sidebar is
         only an invisible anchor at the tab bar: the menu pops up on-screen
         instead of at the off-canvas column. */
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar]{
        transform:none!important;will-change:auto;visibility:hidden!important}
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] [class*="_footArea"]{
        display:flex!important;visibility:visible!important;position:fixed!important;
        left:0;right:0;bottom:env(safe-area-inset-bottom,0px);z-index:47;margin:0;padding:0 12px;
        background:transparent!important}
      html[data-dsh-mobile][data-dsh-ms-bar="on"][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] [class*="_footArea"]{
        bottom:calc(52px + env(safe-area-inset-bottom,0px))}
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] [class*="_footArea"]>*{
        visibility:hidden!important}
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] [class*="_settingsArea"]{
        visibility:visible!important}
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] [class*="_settingsArea"]>*{
        visibility:visible!important}
      html[data-dsh-mobile][data-dsh-ms-account="on"] [data-dsh-ms-sidebar] button[data-signed-out]{
        visibility:visible!important;opacity:0!important;pointer-events:auto!important}

      /* ── phones: no scrollbars anywhere (content still scrolls) ──────── */
      html[data-dsh-mobile],html[data-dsh-mobile] body{scrollbar-width:none!important}
      html[data-dsh-mobile] *{scrollbar-width:none!important;scrollbar-gutter:auto}
      html[data-dsh-mobile] ::-webkit-scrollbar,
      html[data-dsh-mobile] *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;background:transparent!important}

      /* ── forms: no iOS focus zoom, no tap delay ──────────────────────── */
      html[data-dsh-mobile] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
      html[data-dsh-mobile] textarea,
      html[data-dsh-mobile] [contenteditable="true"]{font-size:16px!important}
      html[data-dsh-mobile] button,html[data-dsh-mobile] a{touch-action:manipulation}

      /* ── conversation header: one title line on a phone ────────────────
         The 对话/轨迹 switcher, background-task chips, open-in-app and the
         right-panel corner are all hidden: the title (and the menu button in
         the leading seat) is the whole header. */
      html[data-dsh-mobile] header:has([data-conversation-header-leading]){padding:6px 12px 6px 6px!important;min-height:0!important;
        align-items:center!important}
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [data-conversation-tabs]{display:none!important}
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [class*="_headerActions"],
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [class*="_headerUtilities"],
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [class*="_headerCorner"]{display:none!important}
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [class*="_titleRow"]{min-height:0!important;align-items:center!important;gap:6px!important}
      html[data-dsh-mobile] header:has([data-conversation-header-leading]) [class*="_crumb"]{max-width:220px!important}

      /* ── chat column: narrower gutters, tables that fit ──────────────── */
      html[data-dsh-mobile] [data-conversation-scroll] [class*="_scroll"]{
        padding-left:10px!important;padding-right:10px!important}
      /* Wide markdown tables only reveal their scrollbar on hover upstream, which
         a phone never does — let them wrap inside the viewport instead. */
      html[data-dsh-mobile] .md-table-wide,
      html[data-dsh-mobile] [class*="_tableScroll"]{overflow-x:auto!important;padding-bottom:0!important;
        overscroll-behavior-x:contain}
      html[data-dsh-mobile] [class*="_tableScroll"] table{width:100%!important;max-width:100%!important}
      html[data-dsh-mobile] [class*="_tableScroll"] th,
      html[data-dsh-mobile] [class*="_tableScroll"] td{padding:7px 8px!important;max-width:none!important;min-width:64px!important}

      /* ── viewport fitting ────────────────────────────────────────────── */
      @supports (height:100dvh){
        html[data-dsh-mobile],html[data-dsh-mobile] body,html[data-dsh-mobile] #root{height:100dvh}
        html[data-dsh-mobile][data-dsh-ms-kb="open"] #root{height:var(--dsh-ms-vh,100dvh)}
      }
    `;

    const zh = {
      'bar.label': '页面导航',
      'bar.sessions': '会话',
      'bar.new': '新会话',
      'bar.files': '文件',
      'bar.more': '更多',
      'drawer.open': '打开会话列表',
      'sheet.title': '导航与设置',
      'sheet.sessions': '会话列表',
      'sheet.panels': '面板',
      'sheet.settings': '设置',
      'sheet.display': '显示与调试',
      'sheet.system': '系统',
      'sheet.account': '账户与登录',
      'sheet.update': '检查更新',
      'update.checking': '检查中…',
      'update.updating': '更新中…',
      'update.available': '可更新',
      'update.current': '已是最新',
      'update.done': '已更新',
      'update.local': '本地安装',
      'update.error': '检查失败',
      'sheet.back': '返回对话',
      'sheet.desktop': '桌面版视图',
      'sheet.mobile': '移动适配',
      'sheet.force': '强制手机布局',
      'sheet.reload': '刷新页面',
      'sheet.status': '适配状态',
      'sheet.close': '关闭',
      'chip.desktop': '桌面版',
      'chip.mobile': '手机版',
      'pill.enable': '手机模式',
      'status.ok': '正常',
      'status.pending': '加载中',
      'status.missing': '未找到侧栏',
    };

    const en = {
      'bar.label': 'Page navigation',
      'bar.sessions': 'Sessions',
      'bar.new': 'New',
      'bar.files': 'Files',
      'bar.more': 'More',
      'drawer.open': 'Open session list',
      'sheet.title': 'Navigation and settings',
      'sheet.sessions': 'Session list',
      'sheet.panels': 'Panels',
      'sheet.settings': 'Settings',
      'sheet.display': 'Display and debugging',
      'sheet.system': 'System',
      'sheet.account': 'Account & sign-in',
      'sheet.update': 'Check for updates',
      'update.checking': 'Checking…',
      'update.updating': 'Updating…',
      'update.available': 'Update available',
      'update.current': 'Up to date',
      'update.done': 'Updated',
      'update.local': 'Local install',
      'update.error': 'Check failed',
      'sheet.back': 'Back to conversation',
      'sheet.desktop': 'Desktop view',
      'sheet.mobile': 'Mobile layout',
      'sheet.force': 'Force phone layout',
      'sheet.reload': 'Reload page',
      'sheet.status': 'Layout status',
      'sheet.close': 'Close',
      'chip.desktop': 'Desktop',
      'chip.mobile': 'Phone',
      'pill.enable': 'Phone mode',
      'status.ok': 'Ready',
      'status.pending': 'Loading',
      'status.missing': 'Sidebar not found',
    };

    // ── module state ────────────────────────────────────────────────────
    let ctx = null;
    let config = { ...DEFAULT_CONFIG };
    let frameEl = null;
    let sidebarEl = null;
    let centerEl = null;
    let frameObserver = null;
    let rootObserver = null;
    let bootTimer = null;
    let disposed = false;
    let phone = false;
    let localEnabled = true;
    let desktopView = false;
    let forceMobile = false;
    let status = 'pending';
    let lastMobile = false;
    let layoutChecked = false;
    let sheetCloseTimer = null;
    let accountMenuTimer = null;
    let accountMenuCleanup = null;
    let tr = (key, fallback) => (typeof fallback === 'string' ? fallback : key);
    const cleanupTasks = [];
    const taggedSidebars = new WeakSet();

    /** Tiny external store shared by the three registrations. */
    const store = (() => {
      let state = {
        phone: false,
        enabled: true,
        mobile: false,
        desktop: false,
        force: false,
        drawer: false,
        sheet: false,
        sheetClosing: false,
        update: { status: 'idle' },
        status: 'pending',
        session: undefined,
      };
      const listeners = new Set();
      return {
        get() {
          return state;
        },
        set(patch) {
          let changed = false;
          for (const key of Object.keys(patch)) {
            if (state[key] !== patch[key]) {
              changed = true;
              break;
            }
          }
          if (!changed) return;
          state = { ...state, ...patch };
          for (const listener of [...listeners]) {
            try {
              listener();
            } catch (error) {
              console.warn('[mobile-shell] store listener failed', error);
            }
          }
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    })();

    /** Subscribe a component to the shared store. */
    function useStoreValue() {
      return React.useSyncExternalStore(store.subscribe, store.get);
    }

    /** Subscribe a component to a Host observable through a selector. */
    function useHostValue(observable, selector, fallback) {
      const selectorRef = React.useRef(selector);
      selectorRef.current = selector;
      const subscribe = React.useCallback(
        (onChange) => {
          if (observable === null || observable === undefined || typeof observable.subscribe !== 'function') {
            return () => {};
          }
          const off = observable.subscribe(onChange);
          return () => {
            try {
              if (typeof off === 'function') off();
            } catch (error) {
              /* ignore */
            }
          };
        },
        [observable],
      );
      const getSnapshot = React.useCallback(() => {
        try {
          return selectorRef.current(observable?.getSnapshot?.());
        } catch (error) {
          return fallback;
        }
      }, [observable, fallback]);
      return React.useSyncExternalStore(subscribe, getSnapshot);
    }

    /** Inline icon from a small stroke-path set. */
    function icon(name, size = 20) {
      const shapes = {
        menu: ['M3.5 6.5h17', 'M3.5 12h17', 'M3.5 17.5h11'],
        plus: ['M12 5v14', 'M5 12h14'],
        files: ['M4 6.5A2.5 2.5 0 0 1 6.5 4H10l2 2.5h5.5A2.5 2.5 0 0 1 20 9v8.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z'],
        more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
        chat: ['M20 12a8 8 0 1 0-3.1 6.3L20 20l-1.2-3.2A7.9 7.9 0 0 0 20 12Z'],
        x: ['M6 6l12 12', 'M18 6L6 18'],
        chevron: ['M9.5 6l6 6-6 6'],
        desktop: ['M3.5 5.5h17v10h-17Z', 'M9 20h6', 'M12 15.5V20'],
        phone: ['M7.5 3.5h9A1.5 1.5 0 0 1 18 5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z', 'M10.5 18h3'],
        refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
        panel: ['M4 4h7v7H4Z', 'M13 4h7v7h-7Z', 'M4 13h7v7H4Z', 'M13 13h7v7h-7Z'],
        wallet: ['M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5Z', 'M4 9h13', 'M16.5 13.5h.01'],
        cloud: ['M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 10.6 3.7 3.7 0 0 1 16.8 18Z'],
        tool: ['M14.5 5.5a3.5 3.5 0 0 0 4 4L11 17l-4-4 7.5-7.5Z', 'M6.5 16.5l1 1'],
        clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'],
        gear: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z'],
        user: ['M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
      };
      const paths = shapes[name] ?? shapes.more;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        paths.map((d, index) =>
          h('path', {
            key: index,
            d,
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
      );
    }

    /** Pick a distinguishable glyph for a sidebar panel entry. */
    function panelIcon(row) {
      const text = String((row?.id ?? '') + ' ' + (row?.label ?? '')).toLowerCase();
      if (text.includes('余额') || text.includes('balance') || text.includes('usage')) return icon('wallet', 18);
      if (text.includes('同步') || text.includes('sync') || text.includes('date')) return icon('cloud', 18);
      if (text.includes('mcp') || text.includes('技能') || text.includes('skill')) return icon('tool', 18);
      if (text.includes('自动化') || text.includes('任务') || text.includes('schedule') || text.includes('task')) {
        return icon('clock', 18);
      }
      return icon('panel', 18);
    }

    /** Read one persisted flag, falling back when storage is unavailable. */
    function readPref(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        if (value === null) return fallback;
        return value === '1';
      } catch (error) {
        return fallback;
      }
    }

    /** Persist one flag; storage failures are ignored. */
    function writePref(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        /* ignore */
      }
    }

    /** Whether the phone layout should apply right now. */
    function isMobile() {
      return phone && config.enabled && localEnabled && !desktopView;
    }

    /** Whether the drawer is currently revealed. */
    function drawerOpen() {
      return frameEl !== null && !frameEl.hasAttribute('data-sidebar-collapsed');
    }

    /** Detect a phone-sized viewport (portrait narrow or landscape short edge). */
    function detectPhone() {
      if (forceMobile) return true;
      if (typeof window === 'undefined') return false;
      const width = window.innerWidth;
      if (width <= config.breakpointPx) return true;
      let coarse = false;
      try {
        coarse = window.matchMedia('(pointer: coarse)').matches;
      } catch (error) {
        coarse = false;
      }
      return coarse && width <= 1000 && window.innerHeight <= 500;
    }

    /**
     * Fail-safe: a phone layout whose center column collapsed to nothing would
     * leave a blank screen. Check once per activation and fall back to the stock
     * layout (with a console warning) instead of staying broken.
     */
    function checkLayout() {
      if (layoutChecked) return;
      layoutChecked = true;
      window.setTimeout(() => {
        layoutChecked = false;
        if (!isMobile() || centerEl === null) return;
        let width = 0;
        try {
          width = centerEl.getBoundingClientRect().width;
        } catch (error) {
          return;
        }
        if (width < 40) {
          console.warn('[mobile-shell] center column collapsed to ' + width + 'px; falling back to the stock layout');
          setEnabled(false, false);
        }
      }, 400);
    }

    /** Mirror module state onto <html> and the shared store. */
    function syncAttributes() {
      if (typeof document === 'undefined') return;
      const html = document.documentElement;
      const mobile = isMobile();
      const open = drawerOpen();
      if (mobile !== lastMobile) {
        lastMobile = mobile;
        if (mobile) checkLayout();
      }
      if (mobile) html.setAttribute(ATTR.mobile, '');
      else html.removeAttribute(ATTR.mobile);
      html.setAttribute(ATTR.drawer, open ? 'open' : 'closed');
      html.setAttribute(ATTR.bar, mobile && config.bottomBar ? 'on' : 'off');
      if (desktopView && phone) html.setAttribute(ATTR.desktop, '');
      else html.removeAttribute(ATTR.desktop);
      if (frameEl !== null) frameEl.setAttribute(ATTR.frame, '');
      if (sidebarEl !== null) sidebarEl.setAttribute(ATTR.sidebar, '');
      if (centerEl !== null) centerEl.setAttribute(ATTR.center, '');
      if (sidebarEl !== null) {
        try {
          const shouldInert = mobile && !open;
          if (sidebarEl.inert !== shouldInert) sidebarEl.inert = shouldInert;
        } catch (error) {
          /* inert is an optimization only */
        }
      }
      store.set({
        phone,
        enabled: config.enabled && localEnabled,
        mobile,
        desktop: desktopView,
        force: forceMobile,
        drawer: mobile ? open : false,
        status,
      });
    }

    /** Locate the frame/sidebar/center columns and tag them. */
    function tag() {
      if (typeof document === 'undefined') return false;
      const column = document.querySelector(SELECTOR.sidebar);
      if (column === null) return false;
      const frame = column.parentElement;
      if (frame === null) return false;
      frameEl = frame;
      sidebarEl = column;
      centerEl = document.querySelector(SELECTOR.center);
      frame.setAttribute(ATTR.frame, '');
      column.setAttribute(ATTR.sidebar, '');
      if (centerEl !== null) centerEl.setAttribute(ATTR.center, '');
      observeFrame();
      attachSidebarClick();
      return true;
    }

    /** Re-sync whenever AppFrame's collapsed attribute changes. */
    function observeFrame() {
      if (frameEl === null || typeof MutationObserver === 'undefined') return;
      if (frameObserver !== null) frameObserver.disconnect();
      frameObserver = new MutationObserver(() => {
        syncAttributes();
      });
      frameObserver.observe(frameEl, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] });
    }

    /** Close the drawer when a row inside it navigates. */
    function onSidebarClick(event) {
      if (!store.get().mobile) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[class*="_rowActions"]') !== null) return;
      // A Workspace row (and the per-group "more sessions" button) only expands or
      // collapses its group — that is not navigation, so the drawer must stay open.
      if (target.closest('[class*="_projectRow"],[class*="_sessionOverflowButton"]') !== null) return;
      const navigated = target.closest(
        '[role="treeitem"],[class*="_panelRow"],[class*="_settingsArea"],[class*="_newSession"]',
      );
      if (navigated === null) return;
      window.setTimeout(() => {
        if (drawerOpen()) setDrawer(false);
      }, 80);
    }

    /** Attach the navigation click delegate once per sidebar element. */
    function attachSidebarClick() {
      if (sidebarEl === null || taggedSidebars.has(sidebarEl)) return;
      taggedSidebars.add(sidebarEl);
      sidebarEl.addEventListener('click', onSidebarClick, { passive: true });
    }

    /** Watch for a re-created frame and tag it again. */
    function startRootObserver() {
      if (rootObserver !== null || typeof MutationObserver === 'undefined') return;
      let timer = null;
      rootObserver = new MutationObserver(() => {
        if (timer !== null) return;
        timer = window.setTimeout(() => {
          timer = null;
          if (disposed) return;
          if (frameEl !== null && frameEl.isConnected) return;
          if (!tag()) return;
          if (status !== 'ok') {
            status = 'ok';
            syncAttributes();
          }
        }, 250);
      });
      rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    /** Open or close the drawer through the layout service. */
    function setDrawer(open) {
      const want = open === true;
      if (!want) document.documentElement.removeAttribute('data-dsh-ms-foot');
      if (want) closeAccountAnchor();
      if (want === drawerOpen()) return;
      if (!phone) return;
      try {
        if (!want) document.documentElement.setAttribute(ATTR.drawer, 'closed');
        else document.documentElement.setAttribute(ATTR.drawer, 'open');
        ctx?.layout?.toggleSidebar?.();
      } catch (error) {
        console.warn('[mobile-shell] sidebar toggle failed', error);
      }
      window.setTimeout(syncAttributes, 40);
    }

    /** Close the drawer when it is open. */
    function closeDrawer() {
      setDrawer(false);
    }

    /** Start a Session, falling back to the sidebar's own button. */
    function newSession() {
      closeDrawer();
      const workspace = ctx?.get?.('uiWorkspace');
      if (workspace !== undefined && typeof workspace.startSession === 'function') {
        try {
          workspace.startSession();
          return;
        } catch (error) {
          console.warn('[mobile-shell] startSession failed', error);
        }
      }
      const button = sidebarEl?.querySelector('[class*="_newSession"]');
      if (button instanceof HTMLElement) button.click();
    }

    /** Open the right Sidebar's Files tab (it takes over the frame below 768px). */
    function openFiles() {
      closeDrawer();
      const right = ctx?.get?.('sidebarRight');
      if (right === undefined || typeof right.openTab !== 'function') return;
      try {
        right.openTab('files');
      } catch (error) {
        console.warn('[mobile-shell] files tab unavailable', error);
      }
    }

    /** Open the More sheet (closing the drawer first). */
    function openSheet() {
      cancelSheetClose();
      closeDrawer();
      store.set({ sheet: true, sheetClosing: false });
    }

    /** Dismiss the More sheet with its exit animation. */
    function closeSheet() {
      if (!store.get().sheet || store.get().sheetClosing) return;
      store.set({ sheetClosing: true });
      cancelSheetClose();
      sheetCloseTimer = window.setTimeout(() => {
        sheetCloseTimer = null;
        store.set({ sheet: false, sheetClosing: false });
      }, 200);
    }

    /** Dismiss the More sheet at once, when another surface takes over. */
    function closeSheetNow() {
      cancelSheetClose();
      if (store.get().sheet || store.get().sheetClosing) store.set({ sheet: false, sheetClosing: false });
    }

    /** Cancel a pending exit timer. */
    function cancelSheetClose() {
      if (sheetCloseTimer === null) return;
      window.clearTimeout(sheetCloseTimer);
      sheetCloseTimer = null;
    }

    /** Effective binding of a registered shortcut command, or null. */
    function shortcutBinding(id) {
      try {
        const service = typeof ctx?.get === 'function' ? ctx.get('shortcuts') : undefined;
        const rows = service?.catalog?.getSnapshot?.();
        if (!Array.isArray(rows)) return null;
        const row = rows.find((entry) => entry !== null && entry.id === id);
        const binding = row?.binding;
        return binding !== null && typeof binding?.code === 'string' ? binding : null;
      } catch (error) {
        return null;
      }
    }

    /** Open the stock Settings dialog through its registered shortcut. */
    function openSettingsDialog() {
      const binding = shortcutBinding('settings.open');
      if (binding === null) return false;
      const modifiers = Array.isArray(binding.modifiers) ? binding.modifiers : [];
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
      try {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            code: binding.code,
            key: '',
            ctrlKey: modifiers.includes('control'),
            altKey: modifiers.includes('alt'),
            shiftKey: modifiers.includes('shift'),
            metaKey: modifiers.includes('meta'),
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Drop the temporary account-menu anchor state, if any. */
    function closeAccountAnchor() {
      if (accountMenuCleanup === null) return;
      accountMenuCleanup();
    }

    /**
     * Open the stock account menu (sign in / account / settings) just above the
     * tab bar. The drawer's foot is normally off-canvas, so a temporary frame
     * attribute pins it invisibly at the bar and the menu pops up on-screen.
     */
    function openAccountMenu() {
      if (accountMenuCleanup !== null) return false;
      const sidebar = document.querySelector('[data-dsh-ms-sidebar]');
      const trigger = sidebar?.querySelector('button[data-signed-out]');
      if (!(sidebar instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return false;
      const root = document.documentElement;
      const wasInert = sidebar.inert;
      let seenMenu = false;
      let poll = null;
      let fallbackTimer = null;
      sidebar.inert = false;
      root.setAttribute('data-dsh-ms-account', 'on');
      const cleanup = () => {
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
        if (poll !== null) window.clearInterval(poll);
        poll = null;
        if (accountMenuTimer !== null) window.clearTimeout(accountMenuTimer);
        accountMenuTimer = null;
        root.removeAttribute('data-dsh-ms-account');
        if (wasInert) sidebar.inert = true;
        accountMenuCleanup = null;
      };
      accountMenuCleanup = cleanup;
      try {
        trigger.click();
      } catch (error) {
        cleanup();
        return false;
      }
      poll = window.setInterval(() => {
        if (document.querySelector('[role="menu"]') !== null) seenMenu = true;
        else if (seenMenu) cleanup();
      }, 120);
      accountMenuTimer = window.setTimeout(cleanup, 20000);
      fallbackTimer = window.setTimeout(() => {
        if (seenMenu) return;
        cleanup();
        root.setAttribute('data-dsh-ms-foot', 'on');
        setDrawer(true);
      }, 700);
      return true;
    }

    /** Settings from the More sheet: shortcut first, account menu as fallback. */
    function openSettingsFromSheet() {
      closeSheetNow();
      window.setTimeout(() => {
        if (!openSettingsDialog()) {
          openAccountMenu();
          return;
        }
        window.setTimeout(() => {
          if (document.querySelector('[data-shortcut-modal="settings"]') !== null) return;
          openAccountMenu();
        }, 200);
      }, 40);
    }

    /** Account / sign-in from the More sheet. */
    function openAccountFromSheet() {
      closeSheetNow();
      window.setTimeout(() => openAccountMenu(), 40);
    }

    /** Check the GitHub release feed for a newer build. */
    async function checkUpdates() {
      const current = store.get().update ?? {};
      if (current.status === 'checking' || current.status === 'updating') return;
      store.set({ update: { ...current, status: 'checking' } });
      try {
        const response = await fetch(new URL('plugins/mobile-shell/update', document.baseURI).href, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok !== true) throw new Error(data?.error ?? 'HTTP ' + response.status);
        const failed = typeof data.error === 'string' && data.error !== '';
        store.set({
          update: {
            status: failed ? 'error' : data.available ? 'available' : data.source === 'link' ? 'local' : 'current',
            current: data.current,
            latest: data.latest,
            source: data.source,
            htmlUrl: data.htmlUrl,
            message: data.error ?? '',
          },
        });
      } catch (error) {
        store.set({ update: { ...current, status: 'error', message: String(error?.message ?? error) } });
      }
    }

    /** Install the latest release through the Host, then offer a reload. */
    async function applyUpdate() {
      const current = store.get().update ?? {};
      if (current.status !== 'available') return;
      store.set({ update: { ...current, status: 'updating' } });
      try {
        const response = await fetch(new URL('plugins/mobile-shell/update', document.baseURI).href, {
          method: 'POST',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok !== true) throw new Error(data?.error ?? 'HTTP ' + response.status);
        store.set({
          update: {
            ...current,
            status: 'done',
            latest: data.version ?? current.latest,
            message: String(data.output ?? '').slice(-400),
          },
        });
      } catch (error) {
        store.set({ update: { ...current, status: 'error', message: String(error?.message ?? error) } });
      }
    }

    /** One-line state text for the update row. */
    function updateText(update, t) {
      const status = update?.status ?? 'idle';
      if (status === 'checking') return t('update.checking', 'Checking…');
      if (status === 'updating') return t('update.updating', 'Updating…');
      if (status === 'available') return (update.latest ?? '') + ' · ' + t('update.available', 'Update available');
      if (status === 'done') return (update.latest ?? '') + ' · ' + t('update.done', 'Updated');
      if (status === 'current') return (update.current ?? '') + ' · ' + t('update.current', 'Up to date');
      if (status === 'local') return (update.current ?? '') + ' · ' + t('update.local', 'Local install');
      if (status === 'error') return t('update.error', 'Check failed');
      return update?.current ?? '';
    }

    /** Select a main panel by id; unknown ids are ignored. */
    function selectPanelById(id) {
      try {
        ctx?.layout?.selectPanel?.(id);
        return true;
      } catch (error) {
        console.warn('[mobile-shell] selectPanel failed', id, error);
        return false;
      }
    }

    /** Current global-panel rows from the sidebar's panel list. */
    function panelRows() {
      try {
        const entries = typeof ctx?.slots?.entries === 'function' ? ctx.slots.entries('sidebar.panellist') : [];
        const rows = [];
        for (const entry of entries) {
          const options = entry?.options ?? {};
          const id = typeof options.id === 'string' ? options.id : '';
          if (id === '') continue;
          let label = '';
          try {
            if (typeof options.label === 'function') label = String(options.label() ?? '');
            else if (typeof options.label === 'string') label = options.label;
          } catch (error) {
            label = '';
          }
          rows.push({ id, label: label === '' ? id : label, order: Number(options.order) || 0 });
        }
        rows.sort((left, right) => left.order - right.order);
        return rows;
      } catch (error) {
        return [];
      }
    }

    // ── viewport ────────────────────────────────────────────────────────
    let viewportOwned = false;

    /** Set the viewport meta for phone layout or the zoomed-out desktop view. */
    function applyViewport(desktop) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta === null) return;
      if (!viewportOwned) {
        const original = meta.getAttribute('content');
        if (original !== null) meta.setAttribute('data-dsh-ms-original', original);
        viewportOwned = true;
      }
      meta.setAttribute(
        'content',
        desktop
          ? 'width=1024, viewport-fit=cover'
          : 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      );
    }

    /** Restore the viewport meta this plugin changed, if any. */
    function restoreViewport() {
      if (!viewportOwned) return;
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta !== null) {
        const original = meta.getAttribute('data-dsh-ms-original');
        if (original === null) meta.removeAttribute('content');
        else meta.setAttribute('content', original);
        meta.removeAttribute('data-dsh-ms-original');
      }
      viewportOwned = false;
    }

    /** Switch between the phone layout and the 1024px desktop view. */
    function setDesktopView(on) {
      const next = on === true;
      if (next === desktopView) return;
      if (next) closeDrawer();
      desktopView = next;
      writePref(STORAGE.desktop, next ? '1' : '0');
      if (phone) applyViewport(next);
      syncAttributes();
      window.setTimeout(() => {
        if (!desktopView) updatePhone();
        syncAttributes();
      }, 120);
    }

    /** Enable or disable the mobile layout on this device. */
    function setEnabled(on, persist) {
      const next = on === true;
      localEnabled = next;
      if (persist) writePref(STORAGE.enabled, next ? '1' : '0');
      if (!next) closeDrawer();
      syncAttributes();
    }

    /** Override phone detection (debugging on a desktop window). */
    function setForceMobile(on) {
      forceMobile = on === true;
      writePref(STORAGE.force, forceMobile ? '1' : '0');
      updatePhone();
    }

    /** Recompute the phone flag and re-apply attributes. */
    function updatePhone() {
      if (desktopView) {
        syncAttributes();
        return;
      }
      const next = detectPhone();
      if (next !== phone) phone = next;
      syncAttributes();
    }

    /** Window resize handler. */
    function onResize() {
      if (desktopView) return;
      updatePhone();
    }

    /** Escape closes the sheet first, then the drawer. */
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      const state = store.get();
      if (state.sheet) {
        closeSheet();
        return;
      }
      if (state.mobile && state.drawer) closeDrawer();
    }

    /** Fit #root to the visual viewport when an iOS keyboard covers it. */
    function startViewportWatcher() {
      const viewport = window.visualViewport;
      if (viewport === null || viewport === undefined || !config.keyboardFit) return;
      let base = window.innerHeight;
      const clear = () => {
        document.documentElement.removeAttribute(ATTR.keyboard);
        document.documentElement.style.removeProperty('--dsh-ms-vh');
      };
      const onChange = () => {
        if (!isMobile()) {
          clear();
          return;
        }
        const inner = window.innerHeight;
        if (inner !== base) {
          base = inner;
          clear();
          return;
        }
        const height = Math.round(viewport.height);
        if (height < base - 100) {
          document.documentElement.style.setProperty('--dsh-ms-vh', height + 'px');
          document.documentElement.setAttribute(ATTR.keyboard, 'open');
        } else {
          clear();
        }
      };
      viewport.addEventListener('resize', onChange);
      viewport.addEventListener('scroll', onChange);
      cleanupTasks.push(() => {
        viewport.removeEventListener('resize', onChange);
        viewport.removeEventListener('scroll', onChange);
        clear();
      });
    }

    /** Mark the plugin ready and locate the frame (retrying briefly). */
    function start() {
      // While the desktop view is on, the viewport is no longer phone-sized; the
      // device flag from boot stays authoritative so the chip can switch back.
      if (!desktopView) phone = detectPhone();
      store.set({
        phone,
        force: forceMobile,
        desktop: desktopView,
        enabled: config.enabled && localEnabled,
      });
      if (tag()) {
        status = 'ok';
      } else {
        let waited = 0;
        bootTimer = window.setInterval(() => {
          if (disposed) {
            window.clearInterval(bootTimer);
            bootTimer = null;
            return;
          }
          if (tag()) {
            window.clearInterval(bootTimer);
            bootTimer = null;
            status = 'ok';
            syncAttributes();
            return;
          }
          waited += 120;
          if (waited > 5000) {
            window.clearInterval(bootTimer);
            bootTimer = null;
            status = 'missing-sidebar';
            syncAttributes();
          }
        }, 120);
      }
      syncAttributes();
      startRootObserver();
    }

    /** Read the Host row config; failures keep the defaults. */
    async function loadConfig() {
      try {
        const url = new URL(CONFIG_ROUTE, document.baseURI).href;
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const body = await response.json();
        if (body === null || typeof body !== 'object') return;
        if (typeof body.enabled === 'boolean') config.enabled = body.enabled;
        if (typeof body.breakpointPx === 'number' && Number.isFinite(body.breakpointPx)) {
          config.breakpointPx = Math.min(1024, Math.max(320, Math.round(body.breakpointPx)));
        }
        if (typeof body.bottomBar === 'boolean') config.bottomBar = body.bottomBar;
        if (typeof body.panelChip === 'boolean') config.panelChip = body.panelChip;
        if (typeof body.keyboardFit === 'boolean') config.keyboardFit = body.keyboardFit;
      } catch (error) {
        /* defaults are the contract */
      }
    }

    /** Boot the plugin after apply. */
    async function boot() {
      await loadConfig();
      if (disposed) return;
      localEnabled = readPref(STORAGE.enabled, true);
      forceMobile = readPref(STORAGE.force, false);
      desktopView = readPref(STORAGE.desktop, false);
      phone = detectPhone();
      if (phone && desktopView) applyViewport(true);
      start();
      if (phone && !desktopView) applyViewport(false);
      startViewportWatcher();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      document.addEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        if (!disposed) checkUpdates();
      }, 1200);
    }

    /** Remove every attribute, listener and timer this plugin added. */
    function dispose() {
      if (frameObserver !== null) {
        try {
          frameObserver.disconnect();
        } catch (error) {
          /* ignore */
        }
        frameObserver = null;
      }
      if (rootObserver !== null) {
        try {
          rootObserver.disconnect();
        } catch (error) {
          /* ignore */
        }
        rootObserver = null;
      }
      if (bootTimer !== null) {
        window.clearInterval(bootTimer);
        bootTimer = null;
      }
      cancelSheetClose();
      closeAccountAnchor();
      for (const task of cleanupTasks.splice(0)) {
        try {
          task();
        } catch (error) {
          /* ignore */
        }
      }
      if (sidebarEl !== null) {
        try {
          sidebarEl.removeEventListener('click', onSidebarClick, { passive: true });
        } catch (error) {
          /* ignore */
        }
      }
      store.set({ mobile: false, phone: false, drawer: false, sheet: false, sheetClosing: false, status: 'pending', session: undefined });
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('keydown', onKeyDown);
      const html = document.documentElement;
      for (const name of [ATTR.mobile, ATTR.drawer, ATTR.bar, ATTR.desktop, ATTR.keyboard]) html.removeAttribute(name);
      html.style.removeProperty('--dsh-ms-vh');
      for (const element of [frameEl, sidebarEl, centerEl]) {
        if (element === null) continue;
        for (const name of [ATTR.frame, ATTR.sidebar, ATTR.center]) element.removeAttribute(name);
        try {
          element.inert = false;
        } catch (error) {
          /* ignore */
        }
      }
      frameEl = null;
      sidebarEl = null;
      centerEl = null;
      restoreViewport();
    }

    // ── components ──────────────────────────────────────────────────────
    function BarButton({ icon: glyph, label, onClick, active, disabled, expanded, dot }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-ms-btn',
          'data-active': active ? 'true' : undefined,
          'data-disabled': disabled ? 'true' : undefined,
          'aria-disabled': disabled ? 'true' : undefined,
          'aria-expanded': expanded === undefined ? undefined : expanded ? 'true' : 'false',
          onClick: () => {
            if (!disabled) onClick();
          },
        },
        glyph,
        dot ? h('i', { className: 'dsh-ms-badge', 'aria-hidden': 'true' }) : null,
        h('span', null, label),
      );
    }

    /** Bottom navigation: Sessions / New / Files / More. */
    function MobileBar() {
      const state = useStoreValue();
      if (!state.mobile || state.status !== 'ok' || !config.bottomBar) return null;
      const t = (key, fallback) => tr(key, fallback);
      return h(
        'nav',
        { className: 'dsh-ms-bar', 'data-dsh-ms-bar': '', 'aria-label': t('bar.label', 'Page navigation') },
        h(BarButton, {
          icon: icon('menu'),
          label: t('bar.sessions', 'Sessions'),
          expanded: state.drawer,
          active: state.drawer,
          onClick: () => {
            closeSheetNow();
            setDrawer(!drawerOpen());
          },
        }),
        h(BarButton, {
          icon: icon('plus'),
          label: t('bar.new', 'New'),
          onClick: () => {
            closeSheetNow();
            newSession();
          },
        }),
        h(BarButton, {
          icon: icon('files'),
          label: t('bar.files', 'Files'),
          disabled: state.session === undefined,
          onClick: () => {
            closeSheetNow();
            openFiles();
          },
        }),
        h(BarButton, {
          icon: icon('more'),
          label: t('bar.more', 'More'),
          active: state.sheet,
          dot: (state.update?.status ?? 'idle') === 'available',
          onClick: () => {
            if (store.get().sheet) closeSheet();
            else openSheet();
          },
        }),
      );
    }

    /** Menu button in the conversation header's leading seat. */
    function HeaderMenuButton() {
      const state = useStoreValue();
      if (!state.mobile || state.status !== 'ok') return null;
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-ms-header-btn',
          'data-dsh-ms-header': '',
          'aria-label': tr('drawer.open', 'Open session list'),
          'aria-expanded': state.drawer ? 'true' : 'false',
          onClick: () => setDrawer(!drawerOpen()),
        },
        icon('menu', 18),
      );
    }

    /** A compact switch row inside the sheet's display group. */
    function SheetToggle({ label, checked, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-ms-row',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          onClick: () => onChange(!checked),
        },
        h('span', null, label),
        h('i', { className: 'dsh-ms-switch', 'aria-checked': checked ? 'true' : 'false', 'aria-hidden': 'true' }),
      );
    }

    /** The bottom sheet: navigation, panel shortcuts, display switches and status. */
    function MoreSheet({ panelId, close }) {
      const state = useStoreValue();
      const update = state.update ?? { status: 'idle' };
      React.useEffect(() => {
        if ((store.get().update?.status ?? 'idle') === 'idle') void checkUpdates();
      }, []);
      const rows = panelRows();
      const t = (key, fallback) => tr(key, fallback);
      const statusText =
        state.status === 'ok'
          ? t('status.ok', 'Ready')
          : state.status === 'missing-sidebar'
            ? t('status.missing', 'Sidebar not found')
            : t('status.pending', 'Loading');
      return h(
        'div',
        {
          className: 'dsh-ms-sheet-wrap',
          'data-dsh-ms-sheet-wrap': '',
          'data-closing': state.sheetClosing ? 'true' : undefined,
        },
        h('div', { className: 'dsh-ms-sheet-scrim', onClick: close, 'aria-hidden': 'true' }),
        h(
          'div',
          {
            className: 'dsh-ms-sheet',
            'data-dsh-ms-sheet': '',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('sheet.title', 'Navigation and settings'),
          },
          h(
            'div',
            { className: 'dsh-ms-sheet-top' },
            h('div', { className: 'dsh-ms-sheet-grip', 'aria-hidden': 'true' }),
          h(
            'header',
            { className: 'dsh-ms-sheet-head' },
            h('span', { className: 'dsh-ms-sheet-title' }, t('sheet.title', 'Navigation and settings')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-sheet-close',
                'aria-label': t('sheet.close', 'Close'),
                onClick: close,
              },
              icon('x', 16),
            ),
          ),
          ),
          h(
            'div',
            { className: 'dsh-ms-sheet-body' },
            panelId !== null
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ms-list-row',
                  onClick: () => {
                    selectPanelById(null);
                    close();
                  },
                },
                icon('chat', 18),
                h('span', null, t('sheet.back', 'Back to conversation')),
                h('span', { className: 'dsh-ms-chevron' }, icon('chevron', 16)),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ms-list-row',
              onClick: () => {
                close();
                window.setTimeout(() => setDrawer(true), 30);
              },
            },
            icon('menu', 18),
            h('span', null, t('sheet.sessions', 'Session list')),
            h('span', { className: 'dsh-ms-chevron' }, icon('chevron', 16)),
          ),
          rows.length > 0
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'dsh-ms-section' }, t('sheet.panels', 'Panels')),
                h(
                  'div',
                  { className: 'dsh-ms-grid' },
                  rows.map((row) =>
                    h(
                      'button',
                      {
                        key: row.id,
                        type: 'button',
                        className: 'dsh-ms-tile',
                        'data-active': row.id === panelId ? 'true' : undefined,
                        onClick: () => {
                          selectPanelById(row.id);
                          close();
                        },
                      },
                      panelIcon(row),
                      h('span', null, row.label),
                    ),
                  ),
                ),
              )
            : null,
          h('div', { className: 'dsh-ms-section' }, t('sheet.system', 'System')),
          h(
            'div',
            { className: 'dsh-ms-group' },
            h(
              'button',
              { type: 'button', className: 'dsh-ms-row', onClick: openSettingsFromSheet },
              icon('gear', 18),
              h('span', null, t('sheet.settings', 'Settings')),
              h('span', { className: 'dsh-ms-chevron' }, icon('chevron', 16)),
            ),
            h(
              'button',
              { type: 'button', className: 'dsh-ms-row', onClick: openAccountFromSheet },
              icon('user', 18),
              h('span', null, t('sheet.account', 'Account & sign-in')),
              h('span', { className: 'dsh-ms-chevron' }, icon('chevron', 16)),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-row',
                'data-update': update.status ?? 'idle',
                title: update.message || undefined,
                onClick: () => {
                  const status = update.status ?? 'idle';
                  if (status === 'available') {
                    void applyUpdate();
                    return;
                  }
                  if (status === 'done') {
                    try {
                      window.location.reload();
                    } catch (error) {
                      /* ignore */
                    }
                    return;
                  }
                  if (status === 'local') {
                    if (update.htmlUrl) window.open(update.htmlUrl, '_blank', 'noopener');
                    return;
                  }
                  void checkUpdates();
                },
              },
              update.status === 'checking' || update.status === 'updating'
                ? h('i', { className: 'dsh-ms-spin', 'aria-hidden': 'true' })
                : icon('refresh', 18),
              h('span', null, t('sheet.update', 'Check for updates')),
              h('span', { className: 'dsh-ms-state' }, updateText(update, t)),
            ),
          ),
          h('div', { className: 'dsh-ms-section' }, t('sheet.display', 'Display and debugging')),
          h(
            'div',
            { className: 'dsh-ms-group' },
            h(SheetToggle, {
              label: t('sheet.desktop', 'Desktop view'),
              checked: state.desktop,
              onChange: setDesktopView,
            }),
            h(SheetToggle, {
              label: t('sheet.mobile', 'Mobile layout'),
              checked: state.enabled,
              onChange: (value) => setEnabled(value, true),
            }),
            h(SheetToggle, {
              label: t('sheet.force', 'Force phone layout'),
              checked: state.force,
              onChange: setForceMobile,
            }),
          ),
          h(
            'div',
            { className: 'dsh-ms-foot' },
            h('span', { className: 'dsh-ms-foot-status' }, t('sheet.status', 'Layout status') + ' · ' + statusText),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-foot-link',
                onClick: () => {
                  try {
                    window.location.reload();
                  } catch (error) {
                    /* ignore */
                  }
                },
              },
              t('sheet.reload', 'Reload page'),
            ),
          ),
          ),
        ),
      );
    }

    /** Frame-wide overlay: drawer scrim, sheet, desktop-view chip, re-enable pill. */
    function OverlayRoot() {
      const state = useStoreValue();
      const panelId = useHostValue(
        ctx?.layout?.panelInfo,
        (info) => (info !== null && typeof info === 'object' ? info.activePanelId ?? null : null),
        null,
      );
      const ready = state.status === 'ok';
      // The chip is also the way back out of the desktop view, so it is not
      // gated by the panel chip preference while the desktop view is on.
      const showChip =
        state.phone && ready && (state.desktop || (config.panelChip && panelId !== null));
      const showPill = state.phone && ready && config.enabled && !state.enabled && !state.desktop;
      // Without the bottom bar there must still be a way into the drawer/sheet.
      const showFloatMenu = state.mobile && !config.bottomBar;
      const t = (key, fallback) => tr(key, fallback);
      return h(
        React.Fragment,
        null,
        state.mobile
          ? h('div', {
              className: 'dsh-ms-backdrop',
              'data-dsh-ms-backdrop': '',
              'aria-hidden': 'true',
              onClick: closeDrawer,
            })
          : null,
        state.sheet ? h(MoreSheet, { panelId, close: closeSheet }) : null,
        showFloatMenu
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-float-menu',
                'data-dsh-ms-float-menu': '',
                'aria-label': t('sheet.title', 'Navigation and settings'),
                onClick: openSheet,
              },
              icon('menu', 20),
            )
          : null,
        showChip
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-chip',
                'data-dsh-ms-chip': '',
                onClick: () => setDesktopView(!state.desktop),
              },
              icon(state.desktop ? 'phone' : 'desktop', 16),
              h('span', null, state.desktop ? t('chip.mobile', 'Phone') : t('chip.desktop', 'Desktop')),
            )
          : null,
        showPill
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-ms-pill',
                'data-dsh-ms-pill': '',
                onClick: () => setEnabled(true, true),
              },
              icon('phone', 16),
              h('span', null, t('pill.enable', 'Phone mode')),
            )
          : null,
      );
    }

    // ── plugin body ─────────────────────────────────────────────────────
    return {
      inject: ['slots', 'locale', 'layout'],
      apply(pluginCtx) {
        ctx = pluginCtx;
        try {
          tr = ctx.locale.bind(NS);
        } catch (error) {
          /* fallback translator keeps literal fallbacks */
        }
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mobile-shell: dictionaries');
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = '@local/dsh-mobile-shell';
          tag.textContent = css;
          document.head.appendChild(tag);
          return () => {
            tag.remove();
          };
        }, 'mobile-shell: styles');

        ctx.effect(() => {
          disposed = false;
          void boot();
          return () => {
            disposed = true;
            dispose();
          };
        }, 'mobile-shell: runtime');

        // Session switches (and opening a global panel) dismiss the drawer.
        try {
          ctx.inject(['sidebarRight'], (scope) => {
            const mounted = scope.sidebarRight?.mounted;
            if (mounted === undefined || typeof mounted.getSnapshot !== 'function') return;
            const sync = () => {
              store.set({ session: mounted.getSnapshot() });
              if (store.get().mobile && store.get().drawer) closeDrawer();
            };
            try {
              sync();
            } catch (error) {
              /* ignore */
            }
            let off = null;
            try {
              off = mounted.subscribe(sync);
            } catch (error) {
              console.warn('[mobile-shell] session subscription failed', error);
            }
            cleanupTasks.push(() => {
              try {
                if (typeof off === 'function') off();
              } catch (error) {
                /* ignore */
              }
            });
          });
        } catch (error) {
          console.warn('[mobile-shell] sidebarRight unavailable', error);
        }

        ctx.slots.inject('shell.bottom', () =>
          ctx.slots.register({ name: 'shell.bottom', locale: NS }, MobileBar),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'mobile-shell', order: 80, locale: NS }, OverlayRoot),
        );
        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register({ name: 'conversation.header.leading', locale: NS }, HeaderMenuButton),
        );
      },
    };
  },
});

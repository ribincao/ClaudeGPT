---
name: ClaudeX
description: A quiet personal Codex workspace with conversation at its center.
colors:
  bg: "#191917"
  sidebar: "#141413"
  surface: "#232321"
  surface-raised: "#2b2b28"
  selected: "#393935"
  text: "#eae8e1"
  muted: "#a9a69e"
  faint: "#939087"
  border: "#363631"
  fine-border: "#2c2c28"
  accent: "#d97757"
  accent-hover: "#e48666"
  accent-ink: "#21130d"
  danger: "#ee9d8d"
  dialog: "#1e1e1b"
  light-bg: "#faf9f5"
  light-sidebar: "#f0eee7"
  light-surface: "#ffffff"
  light-surface-raised: "#eeece5"
  light-selected: "#e2ded4"
  light-text: "#302d27"
  light-muted: "#6c685f"
  light-faint: "#746f65"
  light-border: "#d3cfc5"
  light-fine-border: "#e7e3d9"
  light-accent: "#b85638"
  light-accent-hover: "#a94b2e"
  light-accent-ink: "#ffffff"
  light-danger: "#a33a2a"
  light-dialog: "#faf9f5"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "52px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-1.7px"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.2px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
  transcript:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    lineHeight: 1.75
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
  mono:
    fontFamily: "'SFMono-Regular', Consolas, monospace"
rounded:
  inline: "4px"
  compact: "6px"
  control: "7px"
  button: "8px"
  field: "9px"
  popup: "12px"
  dialog: "16px"
spacing:
  compact: "3px"
  tight: "6px"
  small: "8px"
  control: "10px"
  medium: "12px"
  content: "16px"
  section: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "8px 13px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "8px 13px"
    typography: "{typography.label}"
  button-secondary-hover:
    backgroundColor: "{colors.surface-raised}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "8px 13px"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "32px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  attachment-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "6px 8px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "19px 18px 12px"
  segments:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.field}"
    padding: "3px"
---

# Design System: ClaudeX

## Overview

**Creative North Star: "A quiet personal Codex workspace"**

The shipped interface follows the user-pinned Claude Desktop references: charcoal surfaces, warm white text, understated navigation, generous serif greeting, and plain aligned settings rows. The orange knot is the visual identity anchor. This document records `src/styles.css` and the shipped React components; the reference screenshots establish the world, while the implementation establishes the values.

The conversation receives the largest uninterrupted area. Controls use compact system sans text, while the greeting and default assistant prose use Georgia. Depth comes primarily from neighboring surface tones and fine borders; menus and dialogs add soft shadows. The light theme preserves the same geometry and shifts the materials to warm paper tones.

**Key Characteristics:**

- Warm neutral surfaces with a restrained orange accent.
- Serif greeting and reading text paired with compact sans controls.
- Centered conversation width with a persistent desktop navigation rail.
- Fine dividers, gently rounded controls, and aligned settings rows.
- Responsive drawers and horizontal settings navigation on small screens.

## Colors

The palette is warm and nearly neutral, with orange reserved for identity, actions, links, focus, and active status.

### Primary

- **Warm Orange** (`accent`): send and primary buttons, active toggle tracks, links, selected model checks, focus outlines, and activity indicators.
- **Orange Hover** (`accent-hover`): hover state for orange primary and send actions.
- **Accent Ink** (`accent-ink`): foreground against accent and destructive fills.
- **Soft Warning Red** (`danger`): errors and destructive actions; this is a functional status color rather than a second decorative accent.

### Neutral

- **Canvas Charcoal** (`bg`): the main workspace.
- **Deep Rail** (`sidebar`): navigation, file browser, and code-block interiors.
- **Quiet Surface** (`surface`): composer, fields, menus, and approval containers.
- **Raised Charcoal** (`surface-raised`): user messages, secondary hover surfaces, chips, and segmented tracks.
- **Selected Neutral** (`selected`): selected segments, toggles at rest, and emphasized hover states.
- **Dialog Charcoal** (`dialog`): modal body.
- **Warm White** (`text`): primary text; **Muted Stone** (`muted`): secondary labels and descriptions; **Faint Stone** (`faint`): compact metadata and placeholders.
- **Structural Border** (`border`): field and container outlines; **Fine Divider** (`fine-border`): row and panel separators.

Every `light-*` token is the corresponding role in the light theme. Theme switching replaces the existing CSS custom properties, so components retain semantic assignments. System appearance follows the operating system preference. Dark is the base stylesheet palette.

### Named Rules

**The Semantic Surface Rule.** Use the existing canvas, rail, surface, raised, selected, and dialog roles for their observed purposes; theme changes replace those roles together.

**The Action Orange Rule.** Orange marks identity and actionable or active state; ordinary navigation and settings descriptions remain neutral.

## Typography

**Display Font:** Georgia with Times New Roman and generic serif fallbacks.

**Body Font:** macOS system sans, BlinkMacSystemFont, Segoe UI, and generic sans fallbacks.

**Label/Mono Font:** Labels share the system sans stack; code uses SFMono-Regular, Consolas, and generic monospace.

**Character:** The greeting has a generous literary scale. Reading prose is airy; controls are compact and understated. System sans is used for interface labels and Markdown headings, while Georgia is the default conversation prose face.

### Hierarchy

- **Display:** the frontmatter display role governs the desktop greeting. It becomes 43px at 980px, 37px at 760px, and 31px at 430px. With the files panel below 1200px, it becomes 39px until smaller breakpoint rules apply.
- **Title:** settings section headings use the title role; small-screen settings headings become 16px. Sidebar branding uses Georgia at 25px.
- **Body:** controls inherit the root body role; composer text is 17px with 1.55 line height, becoming 16px on mobile. The conversation composer uses 15px.
- **Transcript:** default assistant prose uses the transcript role. User bubbles use one pixel less than the chosen transcript size and 1.6 line height. Small, medium, and large preferences are 15px, 17px, and 19px. The font preference can replace transcript Georgia with system sans without changing the greeting.
- **Label:** reusable action buttons use 13px. Navigation uses 14px; settings row labels use 14px with 1.5 line height. Supporting descriptions use 12px with 1.5 line height, and dense metadata uses 10–12px.
- **Mono:** inline code is 0.81em of its parent; block code is 13px with 1.6 line height. Raw file previews use 11px with 1.7 line height.

### Named Rules

**The Reading and Controls Rule.** Preserve the separation between serif reading surfaces and system sans controls; transcript preferences change reading text, not the global interface face.

## Layout

The full-height shell is a flex layout measured in dynamic viewport height. Desktop navigation occupies 260px; the main pane takes the remaining width. Its header is 64px high. The content width is a shared CSS custom property used by the home composition and transcript: 770px by default, 660px narrow, or 960px wide. The direction contract described a 740px composer; the shipped source uses the shared 770px limit, with internal padding reducing the conversation composer’s visible width.

The home composition centers the greeting and composer in the available pane. The greeting precedes the composer with 44px of space; a compact suggestion row follows with 25px of space. Transcript and conversation composer share a centered column. Transcript scrolling is separate from the composer. A desktop files pane occupies 370px and shrinks to 320px below 1200px.

Settings is an overlay up to 1120px wide and 760px high, with viewport deductions of 90px. A 222px internal rail separates navigation from the scrollable content. Content padding is 52px 32px 35px. Settings rows align labels left and controls right, with a 24px gap, 20px vertical padding, a 70px minimum height, and a fine bottom divider. Repeated compact gaps use 3–12px; paragraphs and internal content commonly use 16–20px. This is an observed rhythm, not a uniform mathematical spacing grid.

Responsive adaptations are explicit:

- **1200px:** workspace chip hides; the file pane narrows; model detail truncates when files are open.
- **980px:** main navigation narrows to 225px; greeting and settings typography tighten; settings rail becomes 200px; settings content uses 24px horizontal padding.
- **760px:** navigation becomes a fixed 265px drawer with a scrim. The main header becomes 58px high. Home gutters become 20px, transcript gutters become 20px, and composer gutters become 15px. The file browser becomes a fixed right drawer, up to 440px or the viewport width. Settings becomes a column overlay with a top search field and horizontally scrolling category buttons; rail captions and footer hide. Labels and controls retain row alignment.
- **430px:** composer controls compress further, model labels truncate, and rows containing segments can wrap with the control aligned right. Name and select fields narrow.

## Elevation & Depth

Tonal layering and one-pixel borders do most of the structural work. The composer has a very light ambient shadow; floating menus, dialogs, toast messages, and mobile drawers carry soft shadows appropriate to their overlay role. There are no hard offset shadows.

### Shadow Vocabulary

- **Composer ambient** (`0 4px 14px #00000008`): subtle separation from the canvas.
- **Floating menu** (`0 9px 30px #00000030`): attachment, model, account, and conversation menus.
- **Modal** (`0 20px 90px #00000040`): dialog separation above the dimmed canvas.
- **Toast** (`0 5px 23px #00000025`): transient feedback.
- **Mobile left drawer** (`12px 0 40px #00000030`) and **mobile right drawer** (`-10px 0 40px #00000030`): panel edges over the conversation.

### Named Rules

**The Overlay Depth Rule.** Keep ordinary rows and navigation flat; use the existing soft shadow vocabulary for elevated composers, menus, dialogs, toasts, and drawers.

## Shapes

Small controls use restrained rounded corners: compact segments at 6px, navigation and icon buttons at 7px, standard action buttons and attachment chips at 8px, and search fields and suggestion buttons at 9px. Popup menus use 12px. Dialogs use 16px on desktop and 13px on mobile. The composer has its own broader 19px desktop curve, reducing to 16px on mobile; this is a signature container shape rather than a general-purpose radius token.

Borders are thin and quiet. Avatars, status dots, and the scroll-to-latest button are circular. User bubbles retain the asymmetric 15px 15px 4px 15px silhouette. Line icons are SVGs, generally 15–23px, with light strokes. The sourced knot assets are SVG identity marks; the build ships no decorative raster imagery. User-provided attachment and Markdown images remain content, not reusable brand materials.

## Components

### Buttons

Quiet rectangular actions and compact icon controls.

- **Primary:** orange fill, accent ink, 8px corners, 8px 13px padding, 36px minimum height; hover uses accent hover.
- **Secondary:** surface fill, structural border, same dimensions; hover uses raised surface.
- **Destructive:** danger fill for confirmed destructive actions; danger text on neutral buttons where appropriate.
- **Ghost / icon:** muted foreground, 32px square, 7px corners; hover adds raised surface and primary text.
- **Focus:** shared 2px accent outline with 3px offset. Disabled actions use reduced opacity; the send button additionally becomes selected-neutral with muted ink.
- **Send / stop:** compact filled square with an inline arrow or stop SVG. Stop reverses primary text and canvas roles.

### Chips

Compact file and skill context rather than decorative labels.

- **Attachments:** raised fill, border, 8px corners, 6px 8px padding, 11px text, and a remove control. Long names truncate; attachment rows wrap.
- **Skills:** the same chip with an orange SVG accent.
- **Workspace:** a muted compact text control that truncates and hides below 1200px.

### Cards / Containers

Broad functional surfaces, without a repeating decorative card grid.

- **Composer:** quiet surface, border, broad corner, minimal ambient shadow. Its focus-within state shifts the border toward muted text using `color-mix`; drag-over changes the border to accent and presents a drop surface.
- **Menus:** surface fill, border, 12px corners, 6px internal padding, and soft elevation. Options use 6px corners and raised hover fill.
- **Approvals and tool activity:** bordered conversation containers with compact sans text. Advanced command and file detail expands inside the transcript.
- **Dialogs:** dialog fill, border, responsive rounded shape, and dimmed backdrop. Motion is a subtle 6px entrance over 180ms with `cubic-bezier(.16, 1, .3, 1)`.

### Inputs / Fields

Neutral fields rely on borders, placeholders, and clear focus.

- **Text fields:** transparent or surface-filled according to context, with 7–9px corners and structural border.
- **Search:** surface-filled bordered container; settings search shifts its border toward muted text on focus-within.
- **Composer:** unbordered textarea inside the enclosing composer, with accent caret and faint placeholder. It grows to 240px and then scrolls.
- **Instructions:** resizable surface textarea, 8px corners, 13px text, and 1.7 line height.
- **Selects:** transparent controls at rest, 7px corners, raised hover surface, and the shared focus outline.

### Navigation

The desktop rail uses muted icon-and-text rows with 7px corners. Hover adds surface fill and primary text; the new conversation action and selected conversation use raised fill. Secondary actions become visible on hover, focus, or selection. Settings navigation uses 8px corners and selected-neutral active fill. Mobile preserves these states while turning the rail into a drawer and settings categories into a horizontal scroll strip.

### Segments and Toggles

Segments use a raised track, 3px inset, compact rounded buttons, and selected-neutral fill with a quiet border shadow. Toggle tracks are 37px by 22px with a 16px round thumb; enabled state uses orange and moves the thumb 15px. The transition takes 180ms with the modal easing.

### Conversation and File Preview

Assistant prose sits directly on the canvas beside the orange knot. User text sits in a raised asymmetric bubble. Code blocks use raised headers, dark rail interiors, thin borders, and horizontal scrolling. Tables scroll horizontally. File previews reuse Markdown styling or compact mono text; files are a side pane on desktop and a drawer on mobile.

Animated activity uses breathing dots (1.4s ease-in-out) or spinning SVGs (1s linear). Both the operating-system reduced-motion preference and the explicit app preference reduce animation and transition durations to 0.001ms and disable smooth scrolling.

## Do's and Don'ts

### Do:

- **Do** use semantic surface and text roles so dark and light themes move together.
- **Do** keep ordinary navigation neutral and reserve orange for identity, actions, focus, links, and active status.
- **Do** preserve serif reading text and compact system sans controls, including user transcript preferences.
- **Do** keep transcript and composer widths linked, and use drawers and horizontal settings navigation at the existing mobile breakpoint.
- **Do** retain fine dividers, aligned settings rows, visible focus, and reduced-motion behavior.

### Don't:

- **Don't** introduce hard offset shadows into this quiet, softly layered world.
- **Don't** replace the pinned knot identity or serif greeting with an unrelated visual style.
- **Don't** turn user attachment imagery or isolated content formatting into reusable brand decoration.
- **Don't** replace plain settings rows with decorative card grids.

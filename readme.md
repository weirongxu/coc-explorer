# coc-explorer

Explorer extension for [coc.nvim](https://github.com/neoclide/coc.nvim)

**Note: Still under development, maybe has some breaking changes.**

[![Build Status](https://img.shields.io/github/workflow/status/weirongxu/coc-explorer/coc-explorer%20CI)](https://github.com/weirongxu/coc-explorer/actions)

## Screenshot

![image](https://user-images.githubusercontent.com/1709861/76720263-471be100-6777-11ea-82c1-614627097b02.png)

## Requirements

`>= vim 8.1.0579` or `>= neovim 0.3.1`

## Usage

1. Install by coc.nvim command:
   ```
   :CocInstall coc-explorer
   ```
2. Configuration custom vim mapping
   ```
   :nmap <space>e :CocCommand explorer<CR>
   ```
3. Open explorer
   ```
   <space>e
   ```
4. Press `?` to show mappings help

## Feature

- [x] Buffer source
  - [x] Highlight visible buffers in real time (neovim only)
- [x] File tree source
  - [x] Basic actions
    - [x] Open file in select / vsplit / tab
          `explorer.openAction.strategy` options:
      - select: Open action use selection UI
      - vsplit: Open action use vsplit
      - split: Open action use split
      - tab: Open action use tab
      - previousBuffer: Open action use last used buffer
      - previousWindow: Open action use last used window
      - sourceWindow: Open action use the window where explorer opened
    - [x] Selection
    - [x] Cut / Copy / Paste
    - [x] Delete action use trash by default
    - [x] Other actions, press `?` in explorer to check out the all actions
  - [x] Git status
  - [x] Reveal current file in real time (neovim only)
  - [x] Icons, use [nerdfont](https://github.com/ryanoasis/nerd-fonts)
  - [x] Search files by Coc-list
  - [x] Preview file attributes by floating window
  - [ ] LSP
    - [x] diagnostic
    - [ ] file rename
  - [ ] Exrename, like [defx](https://github.com/Shougo/defx.nvim)
  - [ ] Archive file (use `lsar / unar`)
  - [ ] SSH
- [x] Bookmark source (require [coc-bookmark](https://github.com/voldikss/coc-bookmark))
- [ ] Git source
  - [ ] Git actions
- [x] Show help

## Command

```
:CocCommand explorer [options] [root-uri]
```

### User events

- `CocExplorerOpenPre`: triggered before open explorer
- `CocExplorerOpenPost`: triggered after open explorer
- `CocExplorerQuitPre`: triggered before quit explorer
- `CocExplorerQuitPost`: triggered after quit explorer

### Example

```vim
:CocCommand explorer
    \ --toggle
    \ --sources=buffer+,file+
    \ /root/path
```

### Presets

```vim
let g:coc_explorer_global_presets = {
\   '.vim': {
\     'root-uri': '~/.vim',
\   },
\   'tab': {
\     'position': 'tab',
\     'quit-on-open': v:true,
\   },
\   'floating': {
\     'position': 'floating',
\     'open-action-strategy': 'sourceWindow',
\   },
\   'floatingTop': {
\     'position': 'floating',
\     'floating-position': 'center-top',
\     'open-action-strategy': 'sourceWindow',
\   },
\   'floatingLeftside': {
\     'position': 'floating',
\     'floating-position': 'left-center',
\     'floating-width': 50,
\     'open-action-strategy': 'sourceWindow',
\   },
\   'floatingRightside': {
\     'position': 'floating',
\     'floating-position': 'right-center',
\     'floating-width': 50,
\     'open-action-strategy': 'sourceWindow',
\   },
\   'simplify': {
\     'file-child-template': '[selection | clip | 1] [indent][icon | 1] [filename omitCenter 1]'
\   }
\ }

" Use preset argument to open it
nmap <space>ed :CocCommand explorer --preset .vim<CR>
nmap <space>ef :CocCommand explorer --preset floating<CR>

" List all presets
nmap <space>el :CocList explPresets
```

### Options

#### `[root-uri]`

Explorer root, default:

- `getcwd()` when `buftype` is `nofile`
- `workspace.rootPath`

#### `--preset <name>`

Open explorer use presets

#### `--toggle | --no-toggle`

Close the explorer if it exists, default: `--toggle`

#### `--focus | --no-focus`

Focus to explorer when opened, default: `--focus`

#### `--open-action-strategy <strategy>`

Strategy for open action, types: `select | vsplit | split | tab | previousBuffer | previousWindow | sourceWindow`, default: `select`

#### `--quit-on-open | --no-quit-on-open`

quit explorer when open action, default: `--no-quit-on-open`

#### `--sources <sources>`

Explorer sources, example: `buffer+,file+`, default: `buffer-,file+`

```
              expand
      collapsed │
          ↓     ↓
    buffer-,file+
    └──┬─┘  └─┬┘
buffer source │
          file source
```

#### `--position <position>`

Explorer position, supported position: `left`, `right`, `tab`, `floating`, default: `left`

#### `--width <number>`

Width of Explorer window for open in left or right side, default: `40`

#### `--content-width <number>`

Content width, default: `0`

#### `--content-width-type <type>`

Type of content width, types: `win-width`, `vim-width`, , default: `vim-width`

#### `--floating-position <position>`

Explorer position for floating window, positions:

- `left-center`
- `center`
- `right-center`
- `center-top`
- `<number for left>,<number for top>`

default: `center`

#### `--floating-width <number>`

Width of Explorer window when position is floating, use negative value or zero to as `width - value`, default: `0`

#### `--floating-height <number>`

Height of Explorer window when position is floating, use negative value or zero to as `height - value`, default: `0`

#### `--floating-content-width <number>`

Width of content when position is floating, use negative value or zero to as `width - value`, default: `0`

#### `--buffer-root-template <template>`

Template for root node of buffer source

Columns:

- icon
- hidden
- title

default: `[icon] [title] [hidden & 1]`

#### `--buffer-child-template <template>`

Template for child node of buffer source

Columns:

- selection
- name
- bufname
- modified
- bufnr
- readonly
- fullpath

default: `[selection | 1] [bufnr] [name][modified][readonly] [fullpath]`

#### `--buffer-child-labeling-template <template>`

Labeling template for child node of buffer source, use for preview when previewAction is labeling

Columns: same with `--buffer-child-template`

default: `[name][bufname][fullpath][modified][readonly]`

#### `--file-root-template <template>`

Template for root node of file source

Columns:

- icon
- hidden
- title
- root
- fullpath

default: `[icon] [title] [hidden & 1][root] [fullpath]`

#### `--file-root-labeling-template <template>`

Labeling template for root node of file source, use for preview when previewAction is labeling

Columns: same with `--file-root-template`

default: `[fullpath]`

#### `--file-child-template <template>`

Template for child node file source

Columns:

- git
- selection
- icon
- filename
- linkIcon
- link
- fullpath
- indent
- clip
- size
- readonly
- modified
- timeModified
- timeCreated
- timeAccessed
- diagnosticError
- diagnosticWarning

default: `[git | 2] [selection | clip | 1] [indent][icon | 1] [diagnosticError & 1][filename omitCenter 1][modified][readonly] [linkIcon & 1][link growRight 1 omitCenter 5][size]`

#### `--file-child-labeling-template <template>`

Labeling template for child node of file source, use for preview when previewAction is labeling

Columns: same with `--file-child-template`

default: `[fullpath][link][diagnosticWarning][diagnosticError][size][timeAccessed][timeModified][timeCreated][readonly][modified]`

#### `--bookmark-root-template <template>`

Template for root node of bookmark source

Columns:

- icon
- hidden
- title

default: `[icon] [title] [hidden & 1]`

#### `--bookmark-child-template <template>`

Template for child node of bookmark source

Columns:

- selection
- position
- filename
- fullpath
- line
- annotation

default: `[selection | 1] [filename] [position]`

#### `--bookmark-child-labeling-template <template>`

Labeling template for child node of bookmark source, use for preview when previewAction is labeling

Columns: same with `--bookmark-child-template`

default: `[filename][fullpath][position][line][annotation]`

#### `--reveal <filepath>`

Explorer will expand to this filepath, default: `current buffer`

## Template grammar

**Example:**

```
[git | 2] [selection | clip | 1] [diagnosticError & 1][filename growRight 1 omitCenter 5]
```

- `[git]`
  - Display `git`.
- `[git | 2]`
  - If `git` is not empty, display `git`, otherwise display `2 spaces`.
- `[selection | clip | 1]`
  - Checking `selection` and `clip` in turn, if one is not empty, display it, otherwise display `1 spaces`.
- `[diagnosticError & 1]`
  - If `diagnosticError` is empty, display nothing. otherwise display `diagnosticError` and `1 space`.
- `[filename growRight 1 omitCenter 5]`
  - Flexible to display `filename`, grow right column volume is 1, omit center volume is 5

**Grammar:**

```
                      block
         ┌──────────────┴───────────────┐
┌────────┴───────────┐ ┌────────────────┴────────────────┐
[selection | clip | 1] [filename growRight 1 omitCenter 5]
                      ↑
                 plain string

            column
     ┌─────────┴───────────┐
     │                     │   volume of modifier
     │         ┌────┬──────│──────────┴────┬────────────┐
 ┌───┴───┐   ┌─┴┐   ↓   ┌──┴───┐           ↓            ↓
[selection | clip | 1] [filename growRight 1 omitCenter 5]
           ↑      ↑              └───┬───┘   └────┬───┘
           └──────┴───────────┬──────┴────────────┘
                           modifier
```

## Configuration

<!-- Generated by 'yarn run gen:doc', please don't edit it directly -->
<!-- prettier-ignore -->
<details>
<summary><code>explorer.presets</code>: Explorer presets. type: <code>object</code></summary>

</details>
<details>
<summary><code>explorer.keyMappingMode</code>: Keymapping mode. type: <code>"none" | "default"</code></summary>
Default: <pre><code>"default"</code></pre>
</details>
<details>
<summary><code>explorer.keyMappings</code>: Custom keymappings. type: <code>object</code></summary>
Default: <pre><code>{}</code></pre>
</details>
<details>
<summary><code>explorer.toggle</code>: Close the explorer if it exists. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.focus</code>: Focus to explorer when opened. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.position</code>: Explorer position. type: <code>"left" | "right" | "tab" | "floating"</code></summary>
Default: <pre><code>"left"</code></pre>
</details>
<details>
<summary><code>explorer.width</code>: Width of explorer window for open in left or right side. type: <code>integer</code></summary>
Default: <pre><code>40</code></pre>
</details>
<details>
<summary><code>explorer.contentWidth</code>: Content width, use negative value or zero to as `width - value`. type: <code>integer</code></summary>
Default: <pre><code>0</code></pre>
</details>
<details>
<summary><code>explorer.contentWidthType</code>: Type of content width. type: <code>"win-width" | "vim-width"</code></summary>
Default: <pre><code>"vim-width"</code></pre>
</details>
<details>
<summary><code>explorer.floating.position</code>: Position of Explorer for floating window. type: <code>"left-center" | "right-center" | "center" | "center-top" | integer</code></summary>
Default: <pre><code>"center"</code></pre>
</details>
<details>
<summary><code>explorer.floating.width</code>: Width of explorer window when position is floating, use negative value or zero to as `width - value`. type: <code>integer</code></summary>
Default: <pre><code>-10</code></pre>
</details>
<details>
<summary><code>explorer.floating.height</code>: Height of explorer window when position is floating, use negative value or zero to as `height - value`. type: <code>integer</code></summary>
Default: <pre><code>-10</code></pre>
</details>
<details>
<summary><code>explorer.floating.contentWidth</code>: Width of content when position is floating, use negative value or zero to as `width - value`. type: <code>integer</code></summary>
Default: <pre><code>0</code></pre>
</details>
<details>
<summary><code>explorer.floating.border.enable</code>: . type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.floating.border.chars</code>: Border chars for floating window, their order is top/right/bottom/left/topleft/topright/botright/botleft. type: <code>string</code></summary>
Default: <pre><code>[
  "─",
  "│",
  "─",
  "│",
  "┌",
  "┐",
  "┘",
  "└"
]</code></pre>
</details>
<details>
<summary><code>explorer.floating.border.title</code>: . type: <code>string</code></summary>
Default: <pre><code>"coc-explorer"</code></pre>
</details>
<details>
<summary><code>explorer.floating.hideOnCocList</code>: Hide floating window, when opening CocList. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.autoExpandMaxDepth</code>: Automatically expand maximum depth of one time. type: <code>integer</code></summary>
Default: <pre><code>20</code></pre>
</details>
<details>
<summary><code>explorer.autoExpandOptions</code>: Automatically expand options. type: <code>"recursive" | "compact" | "uncompact" | "recursiveSingle"</code></summary>
Default: <pre><code>[
  "compact",
  "uncompact"
]</code></pre>
</details>
<details>
<summary><code>explorer.autoCollapseOptions</code>: Automatically collapse options. type: <code>"recursive"</code></summary>
Default: <pre><code>[
  "recursive"
]</code></pre>
</details>
<details>
<summary><code>explorer.activeMode</code>: Render explorer when after open or save buffer. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.quitOnOpen</code>: quit explorer when open action. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.previewAction.strategy</code>: Strategy for preview action. type: <code>"labeling"</code></summary>
Default: <pre><code>"labeling"</code></pre>
</details>
<details>
<summary><code>explorer.previewAction.onHover</code>: Open preview when hovering over on node. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.openAction.strategy</code>: Strategy for open action. type: <code>"select" | "vsplit" | "split" | "tab" | "previousBuffer" | "previousWindow" | "sourceWindow"</code></summary>
Default: <pre><code>"select"</code></pre>
</details>
<details>
<summary><code>explorer.openAction.select.filterFloatWindows</code>: Filter floating windows in select strategy. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.openAction.select.filter</code>: Filter windows for select strategy. type: <code>object</code></summary>
Default: <pre><code>{
  "buftypes": [
    "terminal"
  ],
  "filetypes": [
    "vista_kind",
    "qf"
  ],
  "floatingWindows": true
}</code></pre>
</details>
<details>
<summary><code>explorer.openAction.for.directory</code>: The action when you open a directory of file source. type: <code>string</code></summary>
Default: <pre><code>"cd"</code></pre>
</details>
<details>
<summary><code>explorer.openAction.relativePath</code>: Use relative path when open a file with openAction. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.sources</code>: Explorer sources. type: <code>object</code></summary>
Default: <pre><code>[
  {
    "name": "bookmark",
    "expand": false
  },
  {
    "name": "buffer",
    "expand": false
  },
  {
    "name": "file",
    "expand": true
  }
]</code></pre>
</details>
<details>
<summary><code>explorer.icon.enableNerdfont</code>: Enable nerdfont. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.icon.customIcons</code>: Custom icons and color highlights. type: <code>object</code></summary>
Default: <pre><code>{
  "icons": {},
  "extensions": {},
  "filenames": {},
  "dirnames": {},
  "patternMatches": {},
  "dirPatternMatches": {}
}</code></pre>
</details>
<details>
<summary><code>explorer.icon.enableVimDevicons</code>: Enable use vim-devicons instead of built-in icon configuration. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.icon.expanded</code>: Icon for expanded node. type: <code>string</code></summary>
Default: <pre><code>"-"</code></pre>
</details>
<details>
<summary><code>explorer.icon.collapsed</code>: Icon for collapsed node. type: <code>string</code></summary>
Default: <pre><code>"+"</code></pre>
</details>
<details>
<summary><code>explorer.icon.selected</code>: Selection selected chars for File source. type: <code>string</code></summary>
Default: <pre><code>"✓"</code></pre>
</details>
<details>
<summary><code>explorer.icon.hidden</code>: Icon for hidden status. type: <code>string</code></summary>
Default: <pre><code>"‥"</code></pre>
</details>
<details>
<summary><code>explorer.bookmark.root.template</code>: Template for root node of bookmark source. type: <code>string</code></summary>
Default: <pre><code>"[icon] [title] [hidden & 1]"</code></pre>
</details>
<details>
<summary><code>explorer.bookmark.child.template</code>: Template for child node of bookmark source. type: <code>string</code></summary>
Default: <pre><code>"[selection | 1] [filename] [position] - [annotation]"</code></pre>
</details>
<details>
<summary><code>explorer.bookmark.child.labelingTemplate</code>: Labeling template for child node of bookmark source, use for preview when previewAction is labeling. type: <code>string</code></summary>
Default: <pre><code>"[filename][fullpath][position][line][annotation]"</code></pre>
</details>
<details>
<summary><code>explorer.buffer.showHiddenBuffers</code>: Default show hidden buffers. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.buffer.tabOnly</code>: Default only show buffers in current tab. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.buffer.root.template</code>: Template for root node of buffer source. type: <code>string</code></summary>
Default: <pre><code>"[icon] [title] [hidden & 1]"</code></pre>
</details>
<details>
<summary><code>explorer.buffer.child.template</code>: Template for child node of buffer source. type: <code>string</code></summary>
Default: <pre><code>"[selection | 1] [bufnr] [name][modified][readonly] [fullpath]"</code></pre>
</details>
<details>
<summary><code>explorer.buffer.child.labelingTemplate</code>: Labeling template for child node of buffer source, use for preview when previewAction is labeling. type: <code>string</code></summary>
Default: <pre><code>"[name][bufname][fullpath][modified][readonly]"</code></pre>
</details>
<details>
<summary><code>explorer.datetime.format</code>: Explorer datetime format, check out https://date-fns.org/v2.9.0/docs/format. type: <code>string</code></summary>
Default: <pre><code>"yy/MM/dd HH:mm:ss"</code></pre>
</details>
<details>
<summary><code>explorer.file.autoReveal</code>: Explorer will automatically expand to the current buffer. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.file.diagnosticCountMax</code>: Maximum count of diagnostic column. type: <code>integer</code></summary>
Default: <pre><code>99</code></pre>
</details>
<details>
<summary><code>explorer.file.hiddenRules</code>: Custom hidden rules for file. type: <code>object</code></summary>
Default: <pre><code>{
  "extensions": [
    "o",
    "a",
    "obj",
    "pyc"
  ],
  "filenames": [],
  "patternMatches": [
    "^\\."
  ]
}</code></pre>
</details>
<details>
<summary><code>explorer.file.showHiddenFiles</code>: Default show hidden files. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.file.root.template</code>: Template for root node of file source. type: <code>string</code></summary>
Default: <pre><code>"[icon] [title] [hidden & 1][root] [fullpath]"</code></pre>
</details>
<details>
<summary><code>explorer.file.root.labelingTemplate</code>: Labeling template for root node of file source, use for preview when previewAction is labeling. type: <code>string</code></summary>
Default: <pre><code>"[fullpath]"</code></pre>
</details>
<details>
<summary><code>explorer.file.child.template</code>: Template for child node file source. type: <code>string</code></summary>
Default: <pre><code>"[git | 2] [selection | clip | 1] [indent][icon | 1] [diagnosticError & 1][filename omitCenter 1][modified][readonly] [linkIcon & 1][link growRight 1 omitCenter 5][size]"</code></pre>
</details>
<details>
<summary><code>explorer.file.child.labelingTemplate</code>: Labeling template for child node of file source, use for preview when previewAction is labeling. type: <code>string</code></summary>
Default: <pre><code>"[fullpath][link][diagnosticWarning][diagnosticError][size][timeAccessed][timeModified][timeCreated][readonly][modified]"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.showIgnored</code>: Show ignored files in git column. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.mixed</code>: Icon for git mixed status. type: <code>string</code></summary>
Default: <pre><code>"*"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.unmodified</code>: Icon for git unmodified status. type: <code>string</code></summary>
Default: <pre><code>" "</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.modified</code>: Icon for git modified status. type: <code>string</code></summary>
Default: <pre><code>"M"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.added</code>: Icon for git added status. type: <code>string</code></summary>
Default: <pre><code>"A"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.deleted</code>: Icon for git removed status. type: <code>string</code></summary>
Default: <pre><code>"D"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.renamed</code>: Icon for git renamed status. type: <code>string</code></summary>
Default: <pre><code>"R"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.copied</code>: Icon for git copied status. type: <code>string</code></summary>
Default: <pre><code>"C"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.unmerged</code>: Icon for git unmerged status. type: <code>string</code></summary>
Default: <pre><code>"U"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.untracked</code>: Icon for git untracked status. type: <code>string</code></summary>
Default: <pre><code>"?"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.git.icon.ignored</code>: Icon for git ignored status. type: <code>string</code></summary>
Default: <pre><code>"!"</code></pre>
</details>
<details>
<summary><code>explorer.file.column.clip.copy</code>: Whether the file has been copied. type: <code>string</code></summary>

</details>
<details>
<summary><code>explorer.file.column.clip.cut</code>: Whether the file has been cut. type: <code>string</code></summary>

</details>
<details>
<summary><code>explorer.file.column.indent.chars</code>: Indent chars for file source. type: <code>string</code></summary>
Default: <pre><code>"  "</code></pre>
</details>
<details>
<summary><code>explorer.file.column.indent.indentLine</code>: Whether to display the alignment line. type: <code>boolean</code></summary>

</details>
<details>
<summary><code>explorer.file.tabCD</code>: Change tab directory when performing the cd action. type: <code>boolean</code></summary>
Default: <pre><code>true</code></pre>
</details>
<details>
<summary><code>explorer.git.command</code>: Git command. type: <code>string</code></summary>
Default: <pre><code>"git"</code></pre>
</details>
<details>
<summary><code>explorer.debug</code>: Enable debug. type: <code>boolean</code></summary>
Default: <pre><code>false</code></pre>
</details>

## Custom mappings example

You can use `?` to view all actions of current source

```jsonc
// coc-settings.json
{
  "explorer.keyMappings": {
    "i": false, // cancel default mapkey

    "gk": "expandablePrev",
    "gj": "expandableNext",

    "*": "toggleSelection",
    "<tab>": "actionMenu",

    "h": "collapse",
    "l": ["expandable?", "expand", "open"],
    "J": ["toggleSelection", "nodeNext"],
    "K": ["toggleSelection", "nodePrev"],
    "gl": "expandRecursive",
    "gh": "collapseRecursive",
    "<2-LeftMouse>": [
      "expandable?",
      ["expanded?", "collapse", "expand"],
      "open"
    ],
    "o": ["expanded?", "collapse", "expand"],
    "<cr>": ["expandable?", "cd", "open"],
    "e": "open",
    "s": "open:split",
    "S": "open:split:plain",
    "E": "open:vsplit",
    "t": "open:tab",
    "<bs>": "gotoParent",
    "gp": "preview:labeling",

    "y": "copyFilepath",
    "Y": "copyFilename",
    "c": "copyFile",
    "x": "cutFile",
    "p": "pasteFile",
    "d": "delete",
    "D": "deleteForever",

    "a": "addFile",
    "A": "addDirectory",
    "r": "rename",

    ".": "toggleHidden",
    "R": "refresh",

    "?": "help",
    "q": "quit",
    "<esc>": "esc",
    "X": "systemExecute",
    "gd": "listDrive",

    "f": "search",
    "F": "searchRecursive",

    "gf": "gotoSource:file",
    "gb": "gotoSource:buffer",

    "[[": "sourcePrev",
    "]]": "sourceNext",

    "[d": "diagnosticPrev",
    "]d": "diagnosticNext",

    "[c": "gitPrev",
    "]c": "gitNext",
    "<<": "gitStage",
    ">>": "gitUnstage"
  }
}
```

## Example by Vim API and hooks

```vim
function! s:coc_list_current_dir(args)
  let node_info = CocAction('runCommand', 'explorer.getNodeInfo', 0)
  execute 'cd ' . fnamemodify(node_info['fullpath'], ':h')
  execute 'CocList ' . a:args
endfunction

function! s:init_explorer(bufnr)
  call setbufvar(a:bufnr, '&winblend', 50)
endfunction

function! s:enter_explorer()
  if !exists('b:has_enter_coc_explorer') && &filetype == 'coc-explorer'
    " more mappings
    nmap <buffer> <Leader>fg :call <SID>coc_list_current_dir('-I grep')<CR>
    nmap <buffer> <Leader>fG :call <SID>coc_list_current_dir('-I grep -regex')<CR>
    nmap <buffer> <C-p> :call <SID>coc_list_current_dir('files')<CR>
    let b:has_enter_coc_explorer = v:true
  endif
  " statusline
  setl statusline=coc-explorer
endfunction

augroup CocExplorerCustom
  autocmd!
  autocmd BufEnter call <SID>enter_explorer()
augroup END

" hook for explorer window initialized
function! CocExplorerInited(filetype, bufnr)
  " transparent
  call setbufvar(a:bufnr, '&winblend', 10)
endfunction
```

more API: https://github.com/weirongxu/coc-explorer/wiki/Vim-API

## Inspired by

- VSCode Explorer
- [Shougo/vimfiler.vim](https://github.com/Shougo/vimfiler.vim)
- [Shougo/defx.nvim](https://github.com/Shougo/defx.nvim)
- [lambdalisue/fern.vim](https://github.com/lambdalisue/fern.vim)

# coc-explorer

**Experimental, maybe has active changes and bugs.**

## Screenshot

![image](https://user-images.githubusercontent.com/1709861/64413599-5e8d5980-d0c4-11e9-936f-863d4672c80f.png)

## Requirements

- `>= vim 8.0` or `>= neovim 0.3.1`

## Usage

1. Install by coc.nvim command:
    ```
    :CocInstall coc-explorer
    ```
2. Configuration custom vim mapping
    ```
    :nmap ge :CocCommand explorer --toggle<CR>
    ```
3. Open explorer
    ```
    ge
    ```
4. Press `?` to show default mappings help

## Feature
- [x] Buffer source
    - [x] Highlight visible buffers (neovim only)
- [x] File tree source
    - [x] Basic actions
    - [x] Trash as default delete action
    - [x] Cut / Copy / Paste file or directory
    - [x] Git status
    - [x] Highlight current buffer (neovim only)
    - [ ] LSP rename
    - [ ] Exrename, like defx
    - [ ] Support archived file (use `lsar / unar`)
    - [ ] SSH
- [ ] Git source
    - [ ] Git actions
- [x] Show help

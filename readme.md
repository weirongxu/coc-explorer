# coc-explorer

**Experimental, maybe has active changes and bugs.**

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

## Feature
- [x] Buffer source
    - [x] Highlight visible (neovim only)
- [x] File tree source
    - [x] Basic actions
    - [x] Trash as default delete action
    - [x] Cut / Copy / Paste file or directory
    - [x] Git status
    - [x] Automatic highlight current buffer (neovim only)
    - [ ] Automatic expand current buffer
    - [ ] LSP rename
    - [ ] Exrename, like defx
    - [ ] Support archived file (use `lsar / unar`)
    - [ ] SSH
- [ ] Git source
    - [ ] Git actions
- [x] Show help

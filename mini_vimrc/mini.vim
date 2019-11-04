set nocompatible
set runtimepath^=../../coc.nvim

let g:coc_config_home = expand('<sfile>:h')
let g:coc_extension_root = expand('<sfile>:h')
let &runtimepath .= ',' . expand('<sfile>:h:h')

nmap ge :CocCommand explorer<CR>

set termguicolors
filetype plugin indent on
syntax on
set hidden

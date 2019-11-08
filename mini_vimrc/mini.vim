set nocompatible
set runtimepath^=../../coc.nvim

" let g:coc_node_args = ['--nolazy', '--inspect-brk=6045']
let g:coc_config_home = expand('<sfile>:h')
let g:coc_extension_root = expand('<sfile>:h')
let &runtimepath .= ',' . expand('<sfile>:h:h')

nmap ge :CocCommand explorer<CR>
nmap gE :CocCommand explorer --position=right<CR>

set termguicolors
filetype plugin indent on
syntax on
set hidden

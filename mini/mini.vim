set nocompatible
set runtimepath^=../coc.nvim

let $VIMCONFIG = expand('<sfile>:h')
let &runtimepath .= ',' . expand('<sfile>:h')

nmap ge :CocCommand explorer<CR>

filetype plugin indent on
syntax on
set hidden

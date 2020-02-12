set nocompatible
set runtimepath^=../../coc.nvim

" let g:coc_node_args = ['--nolazy', '--inspect-brk=6045']
let g:coc_config_home = expand('<sfile>:h')
let g:coc_data_home = expand('<sfile>:h') . '/data_home'
let &runtimepath .= ',' . expand('<sfile>:h:h')

nmap ge :CocCommand explorer<CR>
nmap gE :CocCommand explorer --position=right<CR>
execute "nmap <space>r :CocCommand explorer --reveal=".expand('<sfile>:h')."/package.json<CR>"
nmap <space>ff :CocCommand explorer --position=floating<CR>
nmap <space>fl :CocCommand explorer --position=floating --floating-position=left-center --floating-width=50 --floating-height=-10<CR>
nmap <space>fr :CocCommand explorer --position=floating --floating-position=right-center --floating-width=50 --floating-height=-10<CR>
nmap <space>t :CocCommand explorer --position=tab<CR>
nmap <space>a :CocCommand explorer --file-columns=git:selection:" ":clip:" ":diagnosticError:indent:icon:filename;fullpath;size;modified;readonly<CR>
nmap <space>b :CocCommand explorer --file-columns=git:selection:clip:diagnosticError:indent:icon:filename;fullpath;size;created;modified;accessed;readonly<CR>

set hidden
set cmdheight=2
set termguicolors
set wildmenu
set ignorecase
filetype plugin indent on
syntax on

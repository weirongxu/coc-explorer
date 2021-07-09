set nocompatible
set runtimepath^=../../coc.nvim

let g:node_client_debug = 1
let g:coc_node_args = ['--nolazy', '--async-stack-traces']
" let g:coc_node_args = ['--nolazy', '--inspect-brk=6045']
let g:coc_config_home = expand('<sfile>:h')
let g:coc_data_home = expand('<sfile>:h') . '/data_home'
let &runtimepath .= ',' . expand('<sfile>:h:h')

hi CocExplorerNormalFloatBorder guifg=#414347 guibg=#272B34
hi CocExplorerNormalFloat guibg=#272B34

let mapleader = "\<Space>"
nnoremap <Leader>ee :CocCommand explorer<CR>
nnoremap <Leader>eE :CocCommand explorer --position=right<CR>
nnoremap <silent> <Leader>er :call CocAction('runCommand', 'explorer.doAction', 'closest', ['reveal:0'], [['relative', 0, 'file']])<CR>

execute "nnoremap <Leader>r :CocCommand explorer --reveal=".expand('<sfile>:h')."/package.json<CR>"
nnoremap <Leader>t :CocCommand explorer --position=tab<CR>

let g:coc_explorer_global_presets = {
\   '.vim': {
\     'root-uri': '~/.vim',
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
\     'floating-height': -10,
\     'open-action-strategy': 'sourceWindow',
\   },
\   'floatingRightside': {
\     'position': 'floating',
\     'floating-position': 'right-center',
\     'floating-width': 50,
\     'floating-height': -10,
\     'open-action-strategy': 'sourceWindow',
\   },
\   'simplify': {
\     'file-child-template': '[selection | clip | 1] [indent][icon | 1] [filename omitCenter 1]'
\   },
\   'a': {
\     'quit-on-open': v:true,
\     'file-child-template': '[git | 2] [selection | clip | 1] [indent][icon | 1] [filename growRight 1 omitCenter 1][modified]',
\     'file-child-labeling-template': '[fullpath][size][modified][readonly]',
\   },
\   'b': {
\     'file-child-template': '[git | 2] [selection | clip | 1] [indent][icon | 1] [filename growRight 1 omitCenter 1][size]',
\     'file-child-labeling-template': '[fullpath][size][created][modified][accessed][readonly]',
\   },
\   'buffer': {
\     'sources': [{'name': 'buffer', 'expand': v:true}],
\   }
\ }

nnoremap <Leader>v  :CocCommand explorer --preset .vim<CR>
nnoremap <Leader>ff :CocCommand explorer --preset floating<CR>
nnoremap <Leader>ft :CocCommand explorer --preset floatingTop<CR>
nnoremap <Leader>fl :CocCommand explorer --preset floatingLeftside<CR>
nnoremap <Leader>fr :CocCommand explorer --preset floatingRightside<CR>
nnoremap <Leader>s  :CocCommand explorer --preset simplify<CR>
nnoremap <Leader>pa :CocCommand explorer --preset a<CR>
nnoremap <Leader>pb :CocCommand explorer --preset b<CR>
nnoremap <Leader>b  :CocCommand explorer --preset buffer<CR>

autocmd User CocNvimInit CocCommand explorer --preset floating

set hidden
set cmdheight=2
set termguicolors
set wildmenu
set ignorecase
set mouse+=a
filetype plugin indent on
syntax on

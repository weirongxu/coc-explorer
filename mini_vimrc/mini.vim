set nocompatible
set runtimepath^=../../coc.nvim

let g:coc_node_args = ['--nolazy', '--async-stack-traces']
" let g:coc_node_args = ['--nolazy', '--inspect-brk=6045']
let g:coc_config_home = expand('<sfile>:h')
let g:coc_data_home = expand('<sfile>:h') . '/data_home'
let &runtimepath .= ',' . expand('<sfile>:h:h')

hi CocExplorerNormalFloatBorder guifg=#414347 guibg=#272B34
hi CocExplorerNormalFloat guibg=#272B34

nmap ge :CocCommand explorer<CR>
nmap gE :CocCommand explorer --position=right<CR>
execute "nmap <space>r :CocCommand explorer --reveal=".expand('<sfile>:h')."/package.json<CR>"
nmap <space>ff :CocCommand explorer --position=floating<CR>
nmap <space>fl :CocCommand explorer --position=floating --floating-position=left-center --floating-width=50 --floating-height=-10<CR>
nmap <space>fr :CocCommand explorer --position=floating --floating-position=right-center --floating-width=50 --floating-height=-10<CR>
nmap <space>t :CocCommand explorer --position=tab<CR>

let g:coc_explorer_global_presets = {
\   '.vim': {
\     'root-uri': '~/.vim',
\   },
\   'floating': {
\     'position': "floating",
\   },
\   'floatingLeftside': {
\     'position': 'floating',
\     'floating-position': 'left-center',
\     'floating-width': 50,
\     'floating-height': -10,
\   },
\   'floatingRightside': {
\     'position': 'floating',
\     'floating-position': 'right-center',
\     'floating-width': 50,
\     'floating-height': -10,
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
\   }
\ }

nmap <space>v  :CocCommand explorer --preset .vim<CR>
nmap <space>ff :CocCommand explorer --preset floating<CR>
nmap <space>fl :CocCommand explorer --preset floatingLeftside<CR>
nmap <space>fr :CocCommand explorer --preset floatingRightside<CR>
nmap <space>s  :CocCommand explorer --preset simplify<CR>
nmap <space>a  :CocCommand explorer --preset a<CR>
nmap <space>b  :CocCommand explorer --preset b<CR>

set hidden
set cmdheight=2
set termguicolors
set wildmenu
set ignorecase
set mouse+=a
filetype plugin indent on
syntax on

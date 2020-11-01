let g:coc_explorer_filetypes = [
      \ 'coc-explorer',
      \ 'coc-explorer-border',
      \ 'coc-explorer-labeling',
      \ ]

function! CocExplorerAction(name, ...) abort
  return call('CocAction', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

function! CocExplorerActionAsync(name, ...) abort
  return call('CocActionAsync', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

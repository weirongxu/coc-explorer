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

function! CocExplorerDeactivate() abort
  augroup CocExplorerInternal
    autocmd!
  augroup END
endfunction

augroup CocExplorerInternal
  autocmd!
  autocmd TabNew * call coc_explorer#tab#init_id()
  autocmd BufDelete  * call CocExplorerActionAsync('internal.didVimEvent', 'BufDelete', +expand('<abuf>'))
  autocmd BufWipeout * call CocExplorerActionAsync('internal.didVimEvent', 'BufWipeout', +expand('<abuf>'))
  autocmd User CocDiagnosticChange call CocExplorerActionAsync('internal.didVimEvent', 'CocDiagnosticChange')
  autocmd User CocGitStatusChange call CocExplorerActionAsync('internal.didVimEvent', 'CocGitStatusChange')
  autocmd User CocBookmarkChange call CocExplorerActionAsync('internal.didVimEvent', 'CocBookmarkChange')
augroup END

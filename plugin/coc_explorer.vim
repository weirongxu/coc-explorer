function! CocExplorerAction(name, ...)
  return call('CocAction', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

function! CocExplorerActionAsync(name, ...)
  return call('CocActionAsync', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

function! CocExplorerDeactivate()
  augroup CocExplorerInternal
    autocmd!
  augroup END
endfunction

augroup CocExplorerInternal
  autocmd!
  autocmd BufDelete  * call CocExplorerActionAsync('internal.didVimEvent', 'BufDelete', +expand('<abuf>'))
  autocmd BufWipeout * call CocExplorerActionAsync('internal.didVimEvent', 'BufWipeout', +expand('<abuf>'))
  autocmd User CocDiagnosticChange call CocExplorerActionAsync('internal.didVimEvent', 'CocDiagnosticChange')
  autocmd User CocGitStatusChange call CocExplorerActionAsync('internal.didVimEvent', 'CocGitStatusChange')
augroup END

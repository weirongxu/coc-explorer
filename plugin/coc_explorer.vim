function! CocExplorerAction(name, ...)
  return call('CocAction', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

function! CocExplorerActionAsync(name, ...)
  return call('CocActionAsync', extend(['runCommand', 'explorer.' . a:name], a:000))
endfunction

function CocExplorerDeactivate()
  augroup CocExplorerInternal
    autocmd!
  augroup END
endfunction

augroup CocExplorerInternal
  autocmd!
  autocmd BufDelete  * call CocExplorerAction('internal.didVimEvent', 'BufDelete', +expand('<abuf>'))
  autocmd BufWipeout * call CocExplorerAction('internal.didVimEvent', 'BufWipeout', +expand('<abuf>'))
  autocmd User CocDiagnosticChange call CocExplorerAction('internal.didVimEvent', 'CocDiagnosticChange')
  autocmd User CocGitStatusChange call CocExplorerAction('internal.didVimEvent', 'CocGitStatusChange')
augroup END

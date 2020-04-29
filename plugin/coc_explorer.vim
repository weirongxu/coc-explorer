autocmd BufDelete  * call CocAction('runCommand', 'explorer.internal.didVimEvent', 'BufDelete', +expand('<abuf>'))
autocmd BufWipeout * call CocAction('runCommand', 'explorer.internal.didVimEvent', 'BufWipeout', +expand('<abuf>'))

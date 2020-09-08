function! coc_explorer#init#buf(bufnr) abort
  call setbufvar(a:bufnr, '&buftype', 'nofile')
  call setbufvar(a:bufnr, '&bufhidden', 'hide')
  call setbufvar(a:bufnr, '&buflisted', 0)

  call setbufvar(a:bufnr, '&modifiable', 0)
  call setbufvar(a:bufnr, '&modified', 0)
  call setbufvar(a:bufnr, '&readonly', 1)

  call setbufvar(a:bufnr, '&swapfile', 0)
  " call setbufvar(a:bufnr, '&undofile', 0)
  " call setbufvar(a:bufnr, '&undolevels', -1)

  call setbufvar(a:bufnr, '&modeline', 0)
endfunction

function! coc_explorer#init#win(bufnr) abort
  call setbufvar(a:bufnr, '&list', 0)

  call setbufvar(a:bufnr, '&signcolumn', 'no')
  call setbufvar(a:bufnr, '&number', 0)
  call setbufvar(a:bufnr, '&relativenumber', 0)
  call setbufvar(a:bufnr, '&foldenable', 0)
  call setbufvar(a:bufnr, '&foldcolumn', 0)

  call setbufvar(a:bufnr, '&spell', 0)

  call setbufvar(a:bufnr, '&cursorcolumn', 0)
  call setbufvar(a:bufnr, '&cursorline', 0)
  call setbufvar(a:bufnr, '&colorcolumn', '')
endfunction

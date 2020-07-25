if has('nvim')
  function! coc_explorer#win#set_width(win_id, width) abort
    call nvim_win_set_width(a:win_id, a:width)
  endfunction

  function! coc_explorer#win#set_height(win_id, height) abort
    call nvim_win_set_height(a:win_id, a:height)
  endfunction
else
  function! coc_explorer#win#set_width(win_id, width) abort
    call coc#api#call('win_set_width', [a:win_id, a:width])
  endfunction

  function! coc_explorer#win#set_height(win_id, height) abort
    call coc#api#call('win_set_height', [a:win_id, a:height])
  endfunction
endif

if has('nvim')
  function! coc_explorer#win#set_width(win_id, width) abort
    if win_id2win(a:win_id) == 0
      return
    endif
    call nvim_win_set_width(a:win_id, a:width)
  endfunction

  function! coc_explorer#win#set_height(win_id, height) abort
    if win_id2win(a:win_id) == 0
      return
    endif
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

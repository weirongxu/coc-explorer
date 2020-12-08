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

function! coc_explorer#win#emit_buf_read_by_winid(win_id, filepath) abort
  let store_winid = bufwinid(bufnr())
  echom a:win_id
  if store_winid != a:win_id
    noau let successful = win_gotoid(a:win_id)
    if !successful
      return
    endif
  endif
  execute 'doautocmd filetypedetect BufRead ' . fnameescape(a:filepath)
  if store_winid != a:win_id
    noau call win_gotoid(store_winid)
  endif
endfunction

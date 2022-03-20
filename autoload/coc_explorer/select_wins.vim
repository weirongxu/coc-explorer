" Select action
let s:select_wins_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function! s:restore_statuslines(store) abort
  for winnr in keys(a:store)
    call setwinvar(winnr, '&statusline', a:store[winnr])
  endfor
endfunction

function s:store_statusline(store, winnr) abort
  let a:store[a:winnr] = getwinvar(a:winnr, '&statusline')
endfunction

" returns
"   -1  - User cancelled
"   0   - No window selected
"   > 0 - Selected winnr
function! coc_explorer#select_wins#start(buftypes, filetypes, floating_windows) abort
  let store = {}
  let char_idx_mapto_winnr = {}
  let char_idx = 0
  let stored_laststatus = &laststatus
  for winnr in range(1, winnr('$'))
    let bufnr = winbufnr(winnr)
    if index(a:buftypes, getbufvar(bufnr, '&buftype')) >= 0
      continue
    endif
    let filetype = getbufvar(bufnr, '&filetype')
    if index(g:coc_explorer_filetypes, filetype) >= 0
      continue
    endif
    if index(a:filetypes, filetype) >= 0
      continue
    endif
    if a:floating_windows && coc_explorer#util#is_float(winnr)
      continue
    endif
    call s:store_statusline(store, winnr)
    let char_idx_mapto_winnr[char_idx] = winnr
    let char = s:select_wins_chars[char_idx]
    let statusline = printf('%%#CocExplorerSelectUI#%s %s', repeat(' ', winwidth(winnr)/2-1), char)
    call setwinvar(winnr, '&statusline', statusline)
    let char_idx += 1
  endfor

  if len(char_idx_mapto_winnr) == 0
    call s:restore_statuslines(store)
    return 0
  elseif len(char_idx_mapto_winnr) == 1
    call s:restore_statuslines(store)
    return char_idx_mapto_winnr[0]
  else
    if stored_laststatus != 2
      let &laststatus = 2
    end
    redraw!
    let select_winnr = -1
    while 1
      echo 'Please press the letter on statusline to select window, or press <ESC> to cancel'
      let nr = getchar()
      if nr == 27 " ESC
        break
      else
        let select_winnr = get(char_idx_mapto_winnr, string(nr - char2nr('a')), -1)
        if select_winnr != -1
          break
        endif
      endif
    endwhile
    call s:restore_statuslines(store)
    if stored_laststatus != 2
      let &laststatus = stored_laststatus
    end
    return select_winnr
  endif
endfunction

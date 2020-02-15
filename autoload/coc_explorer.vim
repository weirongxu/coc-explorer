let s:explorer_root = expand('<sfile>:p:h:h')

" Buffer & window manage
function! coc_explorer#create(name, explorer_id, position, width, height, left, top)
  let name = a:name.'-'.a:explorer_id
  if a:position ==# 'tab'
    execute 'silent keepalt tabnew '.name
  elseif a:position ==# 'left'
    wincmd t
    execute 'silent keepalt leftabove vsplit '.name
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'right'
    wincmd b
    execute 'silent keepalt rightbelow vsplit '.name
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'floating'
    call nvim_open_win(nvim_create_buf(v:false, v:true), v:true, s:floating_win_config(a:width, a:height, a:left, a:top))
  else
    throw 'No support position '.a:position
  endif
  call coc_explorer#init_buf()
  return bufnr('%')
endfunction

function! coc_explorer#resume(bufnr, position, width, height, left, top)
  if a:position ==# 'left'
    wincmd t
    execute 'silent keepalt leftabove vertical sb '.a:bufnr
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'right'
    wincmd b
    execute 'silent keepalt rightbelow vertical sb '.a:bufnr
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'floating'
    call nvim_open_win(a:bufnr, v:true, s:floating_win_config(a:width, a:height, a:left, a:top))
  else
    throw 'No support position '.a:position
  endif
endfunction

function! s:floating_win_config(width, height, left, top)
  return {
        \ 'relative': 'editor',
        \ 'row': a:top,
        \ 'col': a:left,
        \ 'width': a:width,
        \ 'height': a:height,
        \ }
endfunction

function! coc_explorer#resize_win(position, width)
  if a:position !=# 'tab'
    if a:position !=# 'floating'
      silent setlocal winfixwidth
    endif
    silent execute 'vertical resize '.a:width
  endif
endfunction

function! coc_explorer#init_buf()
  silent setlocal colorcolumn=
              \ filetype=coc-explorer
              \ buftype=nofile bufhidden=hide nobuflisted nolist
              \ nomodifiable nomodified
              \ conceallevel=3 concealcursor=nvic
              \ nomodeline
              \ signcolumn=no
              \ nocursorcolumn cursorline
              \ nofoldenable foldcolumn=0
              \ nonumber norelativenumber
              \ nospell
              \ nowrap
  silent setlocal filetype=coc-explorer
endfunction

function! coc_explorer#is_float_window(winnr)
  if has('nvim') && exists('*nvim_win_get_config')
    let winid = win_getid(a:winnr)
    return nvim_win_get_config(winid)['relative'] != ''
  else
    return 0
  endif
endfunction


" Select action
let s:select_wins_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function! coc_explorer#select_wins_restore(store)
  for winnr in keys(a:store)
    call setwinvar(winnr, '&statusline', a:store[winnr])
  endfor
endfunction

" returns
"   -1  - User cancelled
"   0   - No window selected
"   > 0 - Selected winnr
function! coc_explorer#select_wins(buffer_name, filterFloatWindows)
  let store = {}
  let char_idx_mapto_winnr = {}
  let char_idx = 0
  for winnr in range(1, winnr('$'))
    if a:filterFloatWindows && coc_explorer#is_float_window(winnr)
      continue
    endif
    if stridx(bufname(winbufnr(winnr)), a:buffer_name) == 0
      continue
    endif
    let store[winnr] = getwinvar(winnr, '&statusline')
    let char_idx_mapto_winnr[char_idx] = winnr
    let char = s:select_wins_chars[char_idx]
    let statusline = printf('%%#CocExplorerSelectUI#%s %s', repeat(' ', winwidth(winnr)/2-1), char)
    call setwinvar(winnr, '&statusline', statusline)
    let char_idx += 1
  endfor

  if len(char_idx_mapto_winnr) == 0
    call coc_explorer#select_wins_restore(store)
    return 0
  elseif len(char_idx_mapto_winnr) == 1
    call coc_explorer#select_wins_restore(store)
    return char_idx_mapto_winnr[0]
  else
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
    call coc_explorer#select_wins_restore(store)
    return select_winnr
  endif
endfunction


" Commands
function! coc_explorer#execute_commands(cmds)
  if &filetype == 'coc-explorer'
    for cmd in a:cmds
      execute cmd
    endfor
  endif
endfunction


" mappings
function! coc_explorer#register_mappings(mappings)
  let s:coc_explorer_mappings = a:mappings
  augroup coc_explorer_mappings
    autocmd!
    autocmd FileType coc-explorer call coc_explorer#execute_mappings(s:coc_explorer_mappings)
  augroup END
endfunction

function! coc_explorer#execute_mappings(mappings)
  if &filetype == 'coc-explorer'
    for [key, mapping] in items(a:mappings)
      for [mode, target] in items(mapping)
        execute mode . 'map <buffer> ' . key . ' ' . target
      endfor
    endfor
  endif
endfunction

function! coc_explorer#clear_mappings(mappings)
  if &filetype == 'coc-explorer'
    for [key, mapping] in items(a:mappings)
      for [mode, target] in items(mapping)
        execute mode . 'unmap <buffer> ' . key
      endfor
    endfor
  endif
endfunction

function! coc_explorer#matchdelete_by_ids(ids)
  for id in a:ids
    try
      call matchdelete(id)
    catch /.*/
    endtry
  endfor
endfunction


" Tab ID
let s:tab_id_max = 0

function! coc_explorer#tab_id()
  if ! exists('t:coc_explorer_tab_id')
    let s:tab_id_max = s:tab_id_max + 1
    let t:coc_explorer_tab_id = s:tab_id_max
  endif
  return t:coc_explorer_tab_id
endfunction

function! coc_explorer#tab_id_max()
  return s:tab_id_max
endfunction


" displayslice
function! s:pad_end(str, width)
  return a:str . repeat(' ', a:width - strdisplaywidth(a:str))
endfunction

function! coc_explorer#strdisplayslice(str, start, end)
  let str = a:str
  if a:end != v:null
    let str = matchstr(str, '.*\%<' . (a:end + 2) . 'v')
  endif
  let str = matchstr(str, '\%>' . a:start . 'v.*')
  return s:pad_end(str, a:end - a:start)
endfunction

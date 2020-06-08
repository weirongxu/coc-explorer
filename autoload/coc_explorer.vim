let s:explorer_root = expand('<sfile>:p:h:h', 1)

" Buffer & window manage
function! coc_explorer#create(
      \  name,
      \  explorer_id,
      \  position,
      \  width,
      \  height,
      \  left,
      \  top,
      \  floating_border_enable,
      \  floating_border_chars,
      \  floating_title
      \)
  let name = a:name.'-'.a:explorer_id
  let floating_border_bufnr = v:null
  if a:position ==# 'tab'
    execute 'silent keepalt tabnew '.name
  elseif a:position ==# 'left'
    wincmd t
    execute 'silent keepalt vertical topleft vsplit '.name
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'right'
    wincmd b
    execute 'silent keepalt vertical botright vsplit '.name
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'floating'
    let floating_winid = v:null
    if a:floating_border_enable
      let floating_border_bufnr = nvim_create_buf(v:false, v:true)
      call s:floating_border_buffer_render(
            \  floating_border_bufnr,
            \  a:floating_border_chars,
            \  a:floating_title,
            \  a:width,
            \  a:height,
            \  a:left,
            \  a:top,
            \  v:true
            \)
      let floating_winid = nvim_open_win(
            \  nvim_create_buf(v:false, v:true),
            \  v:true,
            \  s:floating_win_config(a:width-2, a:height-2, a:left+1, a:top+1)
            \)
    else
      let floating_winid = nvim_open_win(
            \  nvim_create_buf(v:false, v:true),
            \  v:true,
            \  s:floating_win_config(a:width, a:height, a:left, a:top)
            \)
    endif
    call nvim_win_set_option(floating_winid, 'winhl', 'Normal:CocExplorerNormalFloat')
  else
    throw 'No support position '.a:position
  endif
  call coc_explorer#init_buf(v:false)
  return [bufnr('%'), floating_border_bufnr]
endfunction

function! coc_explorer#resume(
      \  bufnr,
      \  position,
      \  width,
      \  height,
      \  left,
      \  top,
      \  floating_border_bufnr,
      \  floating_border_enable,
      \  floating_border_chars,
      \  floating_title
      \)
  if a:position ==# 'left'
    wincmd t
    execute 'silent keepalt vertical topleft sb '.a:bufnr
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'right'
    wincmd b
    execute 'silent keepalt vertical botright sb '.a:bufnr
    call coc_explorer#resize_win(a:position, a:width)
  elseif a:position ==# 'floating'
    if a:floating_border_enable && a:floating_border_bufnr isnot v:null
      call s:floating_border_buffer_render(
            \  a:floating_border_bufnr,
            \  a:floating_border_chars,
            \  a:floating_title,
            \  a:width,
            \  a:height,
            \  a:left,
            \  a:top,
            \  v:true
            \)
      call nvim_open_win(
            \  a:bufnr,
            \  v:true,
            \  s:floating_win_config(a:width-2, a:height-2, a:left+1, a:top+1)
            \)
    else
      call nvim_open_win(
            \  a:bufnr,
            \  v:true,
            \  s:floating_win_config(a:width, a:height, a:left, a:top)
            \)
    endif
  else
    throw 'No support position '.a:position
  endif
endfunction

function s:floating_border_buffer_render(
      \  bufnr,
      \  chars,
      \  title,
      \  width,
      \  height,
      \  left,
      \  top,
      \  is_first
      \)
  let winid = nvim_open_win(
        \  a:bufnr,
        \  v:true,
        \  s:floating_win_config(a:width, a:height, a:left, a:top)
        \)
  let repeat_width = a:width - 2
  let title = a:title
  let title_width = strdisplaywidth(title)
 
  " if title is not empty, pad it from both sides
  if strlen(a:title)
      let title = ' ' . a:title . ' ' 
      let title_width -= 2
  endif
  let content = [
        \ a:chars[0]
        \ . title
        \ . repeat(a:chars[1], repeat_width - title_width)
        \ . a:chars[2]]
  let content += repeat([a:chars[7] . repeat(' ', repeat_width) . a:chars[3]], a:height - 2)
  let content += [a:chars[6] . repeat(a:chars[5], repeat_width) . a:chars[4]]
  silent setlocal modifiable noreadonly
  call nvim_buf_set_lines(a:bufnr, 0, -1, v:false, content)
  silent setlocal nomodifiable readonly
  if a:is_first
    call coc_explorer#init_buf(v:true)
    call nvim_win_set_option(winid, 'winhl', 'Normal:CocExplorerNormalFloatBorder')
  endif
  wincmd p
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

function! coc_explorer#init_buf(is_border)
  silent setlocal colorcolumn=
              \ buftype=nofile bufhidden=hide nobuflisted nolist
              \ nomodifiable nomodified readonly
              \ noswapfile noundofile
              \ nomodeline
              \ signcolumn=no
              \ nocursorcolumn nocursorline
              \ nofoldenable foldcolumn=0
              \ nonumber norelativenumber
              \ nospell
              \ nowrap
  if !a:is_border
    silent setlocal cursorline
    silent setlocal filetype=coc-explorer
  end
endfunction

function! coc_explorer#is_float_window(winnr)
  if has('nvim') && exists('*nvim_win_get_config')
    let winid = win_getid(a:winnr)
    return nvim_win_get_config(winid)['relative'] != ''
  else
    return 0
  endif
endfunction

" doautocmd
function! coc_explorer#do_autocmd(name) abort
  if exists('#User#'.a:name)
    exe 'doautocmd User '.a:name
  endif
endfunction

" Close win
if exists('*nvim_win_close')
  function! coc_explorer#close_win_by_bufnr(bufnr)
    let winid = bufwinid(a:bufnr)
    if winid >= 0
      call nvim_win_close(winid, v:true)
    endif
  endfunction
else
  function! coc_explorer#close_win_by_bufnr(bufnr)
    let winnr = bufwinnr(a:bufnr)
    if winnr >= 0
      execute winnr . 'wincmd c'
    endif
  endfunction
endif

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
function! coc_explorer#select_wins(buffer_name, buftypes, filetypes, floatingWindows)
  let store = {}
  let char_idx_mapto_winnr = {}
  let char_idx = 0
  for winnr in range(1, winnr('$'))
    let bufnr = winbufnr(winnr)
    if index(a:buftypes, getbufvar(bufnr, '&buftype')) >= 0
      continue
    endif
    if index(a:filetypes, getbufvar(bufnr, '&filetype')) >= 0
      continue
    endif
    if a:floatingWindows && coc_explorer#is_float_window(winnr)
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


" setlines
function coc_explorer#buf_set_lines(bufnr, start, end, strict_indexing, lines)
  let cursor = v:null
  let winid = bufwinid(a:bufnr)
  if winid >= 0
    let cursor = nvim_win_get_cursor(winid)
  endif
  call nvim_buf_set_lines(a:bufnr, a:start, a:end, a:strict_indexing, a:lines)
  if winid >= 0
    try
      call nvim_win_set_cursor(winid, cursor)
    catch
    endtry
  endif
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

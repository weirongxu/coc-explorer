" Commands
function! coc_explorer#util#execute_commands(cmds) abort
  if &filetype == 'coc-explorer'
    for cmd in a:cmds
      execute cmd
    endfor
  endif
endfunction

" Is float
if has('nvim')
  function! coc_explorer#util#is_float(winnr) abort
    if !exists('*nvim_win_get_config')
      return v:false
    endif
    let winid = win_getid(a:winnr)
    return nvim_win_get_config(winid)['relative'] != ''
  endfunction
else
  function! coc_explorer#util#is_float(winnr) abort
    return v:false
  endfunction
endif

" Setlines
function! coc_explorer#util#buf_set_lines_skip_cursor(bufnr, start, end, strict_indexing, lines) abort
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

" doautocmd
function! coc_explorer#util#do_autocmd(name) abort
  if exists('#User#'.a:name)
    exe 'doautocmd <nomodeline> User '.a:name
  endif
endfunction

" Close win
if exists('*nvim_win_close')
  function! coc_explorer#util#close_win_by_bufnr(...) abort
    for bufnr in a:000
      try
        let winid = bufwinid(bufnr)
        if winid >= 0
          call nvim_win_close(winid, v:true)
        endif
      catch
      endtry
    endfor
  endfunction
else
  function! coc_explorer#util#close_win_by_bufnr(...) abort
    for bufnr in a:000
      try
        let winnr = bufwinnr(bufnr)
        if winnr >= 0
          execute winnr . 'wincmd c'
        endif
      catch
      endtry
    endfor
  endfunction
endif

" Displayslice
function! s:pad_end(str, width) abort
  return a:str . repeat(' ', a:width - strdisplaywidth(a:str))
endfunction

function! coc_explorer#util#strdisplayslice(str, start, end) abort
  let str = a:str
  if a:end != v:null
    let str = matchstr(str, '.*\%<' . (a:end + 2) . 'v')
  endif
  let str = matchstr(str, '\%>' . a:start . 'v.*')
  return s:pad_end(str, a:end - a:start)
endfunction

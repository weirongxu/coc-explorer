" Commands
function! coc_explorer#util#execute_commands(cmds) abort
  if &filetype == 'coc-explorer'
    for cmd in a:cmds
      execute cmd
    endfor
  endif
endfunction

let s:is_nvim = has('nvim')

" Is float
if s:is_nvim
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
  if !s:is_nvim && !has('patch-8.2.1997') && &buftype == 'terminal'
    return
  endif

  call setbufvar(a:bufnr, '&modifiable', 1)
  call setbufvar(a:bufnr, '&readonly', 0)

  try
    if s:is_nvim
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
    else
      call coc#api#call('buf_set_lines', [a:bufnr, a:start, a:end, a:strict_indexing, a:lines])
    endif
  catch
  endtry

  call setbufvar(a:bufnr, '&readonly', 1)
  call setbufvar(a:bufnr, '&modifiable', 0)
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

" Open file
function! coc_explorer#util#open_file(cmd, filepath, is_relative) abort
  let cur_fullpath = expand('%:p')
  if a:cmd == 'edit'
    if cur_fullpath == a:filepath
      return
    endif
    if &modified && !&hidden
      echoerr 'Vim hidden option is off'
      return
    endif
  endif
  let path = a:filepath
  if a:is_relative
    let path = fnamemodify(path, ':.')
  endif
  let path = fnameescape(path)
  execute a:cmd . ' ' . path
endfunction
